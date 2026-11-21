import { NextResponse } from "next/server";

import { getWeather } from "@/lib/clients/openmeteo";

/** GET /api/weather?lat&lon&scenario → 14 past + 7 forecast days (Tmin, Tmax °F, rain, ET0 mm, gust mph). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat") ?? 27.95);
  const lon = Number(u.searchParams.get("lon") ?? -82.46);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "lat and lon must be numbers" }, { status: 400 });
  return NextResponse.json(await getWeather(lat, lon, u.searchParams.get("scenario")));
}
