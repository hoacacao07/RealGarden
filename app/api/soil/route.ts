import { NextResponse } from "next/server";

import { getSoil } from "@/lib/clients/soil";
import { drainageFrom, soilTypeFrom } from "@/lib/engine/soil";

/**
 * GET /api/soil?lat&lon → USDA soil survey facts for the dominant soil at the point, plus the app's
 * simple texture/drainage classes. `soil_source` is "unknown" for Urban land map units or missing values.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 24 || lat > 31.5 || lon < -88 || lon > -79.5) {
    return NextResponse.json({ error: "lat and lon must be a point in Florida" }, { status: 400 });
  }
  try {
    const s = await getSoil(lat, lon);
    return NextResponse.json({ ...s, soil: soilTypeFrom(s), drainage: drainageFrom(s.drainage_class) });
  } catch (e) {
    console.error("[soil] failed", e);
    return NextResponse.json({ soil_source: "unknown", found: false, urban: false, source_kind: "fixture" });
  }
}
