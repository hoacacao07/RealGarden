import { NextResponse } from "next/server";

import zipsJson from "@/data/zips.json";
import { getZone } from "@/lib/clients/phzm";
import { haversineKm, regionForLat } from "@/lib/engine/geo";
import { zoneForLat, zoneLabel } from "@/lib/engine/zone";

const ZIPS = zipsJson.zips as Record<string, { place: string; lat: number; lon: number; coast_mi: number }>;

const inFlorida = (lat: number, lon: number) => lat >= 24 && lat <= 31.5 && lon >= -88 && lon <= -79.5;

/**
 * GET /api/zone?zip=33620 or /api/zone?lat=27.95&lon=-82.46 (a pin dropped on the map)
 * → { zip, zone, label, lat, lon, place, region, coast_mi, source }.
 * For a pin, the nearest known ZIP within 15 km supplies the zone, place and coast distance; otherwise the zone is
 * estimated from latitude.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.has("lat") || q.has("lon")) return byPin(Number(q.get("lat")), Number(q.get("lon")));

  const zip = q.get("zip") ?? "";
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "zip must be 5 digits" }, { status: 400 });
  const known = ZIPS[zip];
  const z = await getZone(zip, known?.lat);
  const lat = known?.lat ?? z?.lat ?? null;
  const lon = known?.lon ?? z?.lon ?? null;
  if (!z || lat == null || lon == null) return NextResponse.json({ error: "We don't know that ZIP yet. Drop a pin on the map instead." }, { status: 404 });
  if (!inFlorida(lat, lon)) return NextResponse.json({ error: "That ZIP isn't in Florida." }, { status: 400 });
  return NextResponse.json({
    zip, zone: z.zone, label: zoneLabel(z.zone), lat, lon, place: known?.place ?? null, region: regionForLat(lat),
    coast_mi: known?.coast_mi ?? null, source: z.source,
  });
}

async function byPin(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "lat and lon must be numbers" }, { status: 400 });
  if (!inFlorida(lat, lon)) return NextResponse.json({ error: "Drop the pin somewhere in Florida." }, { status: 400 });
  let near: { zip: string; km: number } | null = null;
  for (const [zip, z] of Object.entries(ZIPS)) {
    const km = haversineKm(lat, lon, z.lat, z.lon);
    if (!near || km < near.km) near = { zip, km };
  }
  const close = near && near.km <= 15 ? near.zip : null;
  const z = close ? await getZone(close, ZIPS[close].lat) : null;
  const zone = z?.zone ?? zoneForLat(lat);
  return NextResponse.json({
    zip: close ?? "", zone, label: zoneLabel(zone), lat, lon, place: close ? ZIPS[close].place : null, region: regionForLat(lat),
    coast_mi: close ? ZIPS[close].coast_mi : null, source: z?.source ?? "estimate",
  });
}
