import { NextResponse } from "next/server";

import { cleanPhoto, readPhoto, UploadError } from "@/lib/checkin";
import { diagnose } from "@/lib/ai/features";
import { getWeather } from "@/lib/clients/openmeteo";
import { getGarden, getPlant } from "@/lib/data";
import { allow, clientIp } from "@/lib/rate-limit";

/** POST /api/diagnose (multipart: image | demo_photo, plant_id?, garden_id?) → Gemini structured diagnosis. */
export async function POST(req: Request) {
  if (!allow(`diagnose:${clientIp(req)}`, 40)) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  try {
    const form = await req.formData();
    const photo = await readPhoto(form);
    const clean = await cleanPhoto(photo.bytes);
    const [plant, garden] = await Promise.all([getPlant(String(form.get("plant_id") ?? "")), getGarden(String(form.get("garden_id") ?? ""))]);
    const wx = garden ? await getWeather(garden.site.lat, garden.site.lon, null) : null;
    const context = {
      plant: plant && { name: plant.common_name, scientific: plant.scientific_name, common_issues: plant.common_issues },
      site: garden && { region: garden.site.region, soil: garden.site.soil, sun: garden.site.sun },
      last_7_days_weather: wx?.history.slice(-7) ?? [],
    };
    return NextResponse.json(await diagnose({ base64: clean.base64, mime: "image/jpeg" }, context, photo.demoPhoto));
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[diagnose]", e);
    return NextResponse.json({ error: "Could not diagnose the photo." }, { status: 500 });
  }
}
