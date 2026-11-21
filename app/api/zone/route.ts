import { NextResponse } from "next/server";

import zipsJson from "@/data/zips.json";
import { getZone } from "@/lib/clients/phzm";
import { regionForLat } from "@/lib/engine/geo";
import { zoneLabel } from "@/lib/engine/zone";

const ZIPS = zipsJson.zips as Record<string, { place: string; lat: number; lon: number; coast_mi: number }>;

/** GET /api/zone?zip=33620 → { zip, zone, label, lat, lon, place, region, coast_mi, source }. */
export async function GET(req: Request) {
  const zip = new URL(req.url).searchParams.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "zip must be 5 digits" }, { status: 400 });
  const known = ZIPS[zip];
  const z = await getZone(zip, known?.lat);
  const lat = known?.lat ?? z?.lat ?? null;
  const lon = known?.lon ?? z?.lon ?? null;
  if (!z || lat == null || lon == null) return NextResponse.json({ error: "We don't know that ZIP yet. Drop a pin on the map instead." }, { status: 404 });
  if (lat < 24 || lat > 31.5 || lon < -88 || lon > -79.5) return NextResponse.json({ error: "That ZIP isn't in Florida." }, { status: 400 });
  return NextResponse.json({
    zip, zone: z.zone, label: zoneLabel(z.zone), lat, lon, place: known?.place ?? null, region: regionForLat(lat),
    coast_mi: known?.coast_mi ?? null, source: z.source,
  });
}
