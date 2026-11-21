import { NextResponse } from "next/server";

import { diagnose } from "@/lib/ai/features";
import { getWeather } from "@/lib/clients/openmeteo";
import { identify } from "@/lib/clients/plantnet";
import { cleanPhoto, matchPlant, readPhoto, UploadError } from "@/lib/checkin";
import { getGarden, getPlants } from "@/lib/data";
import { prisma } from "@/lib/db";
import { roundCoord } from "@/lib/engine/geo";
import { nativeSwap } from "@/lib/engine/recommend";
import { allow, clientIp } from "@/lib/rate-limit";
import { storePhoto } from "@/lib/supabase";

/**
 * POST /api/checkins (multipart): garden_id, image | demo_photo, plant_id?, placement_id?, share?, height_ft?
 * Upload → strip EXIF → Pl@ntNet identify → Gemini diagnose → save Checkin (+ anonymous Report if shared).
 * Rate limited to 20 uploads per hour per IP, 5 MB max.
 */
export async function POST(req: Request) {
  if (!allow(`checkin:${clientIp(req)}`)) {
    return NextResponse.json({ error: "Too many check-ins from this connection. Try again in an hour." }, { status: 429 });
  }
  try {
    const form = await req.formData();
    const gardenId = String(form.get("garden_id") ?? "");
    const [garden, plants] = await Promise.all([getGarden(gardenId), getPlants()]);
    if (!garden) return NextResponse.json({ error: "Garden not found" }, { status: 404 });

    const photo = await readPhoto(form);
    const clean = await cleanPhoto(photo.bytes);
    const picked = plants.find((p) => p.id === form.get("plant_id")) ?? null;

    const id = await identify({ bytes: clean.jpeg, mime: "image/jpeg" }, photo.demoPhoto, picked && { scientific: picked.scientific_name, common: picked.common_name });
    const match = matchPlant(id.identify, plants);
    const plant = match?.plant ?? picked;

    const wx = await getWeather(garden.site.lat, garden.site.lon, null);
    const context = {
      plant: plant && { name: plant.common_name, scientific: plant.scientific_name, origin: plant.origin, common_issues: plant.common_issues, bloom_months: plant.bloom_months },
      site: { region: garden.site.region, soil: garden.site.soil, sun: garden.site.sun, coastal_distance_mi: garden.site.coastal_distance_mi },
      last_7_days_weather: wx.history.slice(-7),
    };
    const dx = await diagnose({ base64: clean.base64, mime: "image/jpeg" }, context, photo.demoPhoto);

    const stored = photo.demoPhoto
      ? { url: `/demo-photos/${photo.demoPhoto}.jpg`, stored: "demo" as const }
      : await storePhoto(`${garden.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`, clean.jpeg, clean.thumb);

    const placementId = String(form.get("placement_id") ?? "") || null;
    const heightRaw = Number(form.get("height_ft"));
    const checkin = await prisma.checkin.create({
      data: {
        garden_id: garden.id, image_url: stored.url, identify: JSON.parse(JSON.stringify(id.identify)),
        matched_plant_id: plant?.id ?? null, diagnosis: JSON.parse(JSON.stringify(dx.diagnosis)),
        placement_id: placementId && garden.placements.some((p) => p.id === placementId) ? placementId : null,
        height_ft: Number.isFinite(heightRaw) && heightRaw > 0 && heightRaw < 100 ? heightRaw : null,
      },
    });

    // Anonymous report: only when the user opts in, only for a real problem, location rounded to ~1 km.
    let report = null;
    const top = dx.diagnosis.candidates[0];
    const problem = !["healthy", "unclear"].includes(dx.diagnosis.overall_health) && top && top.confidence >= 0.4;
    if (form.get("share") === "true" && problem) {
      report = await prisma.report.create({
        data: {
          issue_key: top.issue_key, label: top.label, host_plant_id: plant?.id ?? null,
          lat_rounded: roundCoord(garden.site.lat), lon_rounded: roundCoord(garden.site.lon), is_sample: false, checkin_id: checkin.id,
        },
      });
    }

    const swap = plant ? nativeSwap(plant, plants) : null;
    return NextResponse.json({
      checkin_id: checkin.id, image_url: stored.url.startsWith("data:") ? null : stored.url,
      identify: id.identify, identify_source: id.source,
      matched: plant ? { id: plant.id, common_name: plant.common_name, scientific_name: plant.scientific_name, origin: plant.origin, invasive_status: plant.invasive_status, score: match?.score ?? null, from: match ? "photo" : "picked" } : null,
      diagnosis: dx.diagnosis, diagnosis_source: dx.source,
      swap: swap && { message: swap.message, alternatives: swap.alternatives.map((a) => ({ id: a.id, common_name: a.common_name, hex: a.flower_colors[0]?.hex ?? a.foliage_color })) },
      report: report && { id: report.id, label: report.label, lat: report.lat_rounded, lon: report.lon_rounded },
      shared_skipped: form.get("share") === "true" && !report ? "Nothing to share: no clear problem found." : null,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[checkins] failed", e);
    return NextResponse.json({ error: "Could not process the check-in. Try again." }, { status: 500 });
  }
}
