import { NextResponse } from "next/server";

import { cleanPhoto, matchPlant, readPhoto, UploadError } from "@/lib/checkin";
import { identify } from "@/lib/clients/plantnet";
import { getPlants } from "@/lib/data";
import { allow, clientIp } from "@/lib/rate-limit";

/** POST /api/identify (multipart: image | demo_photo) → Pl@ntNet top 5 species + catalog match. */
export async function POST(req: Request) {
  if (!allow(`identify:${clientIp(req)}`, 40)) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  try {
    const photo = await readPhoto(await req.formData());
    const clean = await cleanPhoto(photo.bytes);
    const r = await identify({ bytes: clean.jpeg, mime: "image/jpeg" }, photo.demoPhoto);
    const m = matchPlant(r.identify, await getPlants());
    return NextResponse.json({ ...r, matched: m && { id: m.plant.id, common_name: m.plant.common_name, score: m.score } });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[identify]", e);
    return NextResponse.json({ error: "Could not identify the photo." }, { status: 500 });
  }
}
