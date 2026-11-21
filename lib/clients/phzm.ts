/**
 * ZIP → USDA hardiness zone via https://phzmapi.org/{zip}.json (community wrapper of the 2023 USDA map, not the
 * official map). Answers are cached in the HardinessZone table; saved answers in data/fixtures/phzm.json cover the
 * demo ZIPs; anything else falls back to a latitude estimate (labeled as such).
 */
import zipsJson from "../../data/zips.json";
import { prisma } from "../db";
import { zoneForLat } from "../engine/zone";
import { fetchJson, fixture, liveOrFixture } from "./base";

export interface ZoneInfo {
  zip: string;
  zone: string;
  temperature_range: string | null;
  lat: number | null;
  lon: number | null;
  source: "phzmapi" | "cache" | "fixture" | "estimate";
}

interface Phzm { zone: string; temperature_range?: string; coordinates?: { lat: number | string; lon: number | string } }

const ZIPS = zipsJson.zips as Record<string, { lat: number; lon: number }>;

export async function getZone(zip: string, latHint?: number | null): Promise<ZoneInfo | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const hit = await Promise.resolve().then(() => prisma.hardinessZone.findUnique({ where: { zip } })).catch(() => null);
  if (hit) return { zip, zone: hit.zone, temperature_range: hit.temperature_range, lat: hit.lat, lon: hit.lon, source: "cache" };

  const saved = () => fixture<{ zips: Record<string, Phzm> }>("phzm.json").zips[zip] ?? null;
  const r = await liveOrFixture<Phzm | null>("phzmapi", {
    live: (signal) => fetchJson<Phzm>(`https://phzmapi.org/${zip}.json`, { signal }),
    fallback: saved,
  });
  const lat = latHint ?? ZIPS[zip]?.lat ?? null;
  if (!r.data?.zone) {
    if (lat == null) return null;
    return { zip, zone: zoneForLat(lat), temperature_range: null, lat, lon: ZIPS[zip]?.lon ?? null, source: "estimate" };
  }
  const info: ZoneInfo = {
    zip, zone: r.data.zone, temperature_range: r.data.temperature_range ?? null,
    lat: r.data.coordinates ? Number(r.data.coordinates.lat) : lat, lon: r.data.coordinates ? Number(r.data.coordinates.lon) : ZIPS[zip]?.lon ?? null,
    source: r.source === "live" ? "phzmapi" : "fixture",
  };
  if (r.source === "live") {
    await Promise.resolve().then(() => prisma.hardinessZone.upsert({
      where: { zip }, create: { zip, zone: info.zone, temperature_range: info.temperature_range, lat: info.lat, lon: info.lon },
      update: { zone: info.zone, temperature_range: info.temperature_range, lat: info.lat, lon: info.lon, fetched_at: new Date() },
    })).catch(() => undefined);
  }
  return info;
}
