/**
 * NHC active tropical storms (https://www.nhc.noaa.gov/CurrentStorms.json, empty array when there are none).
 * Storms within 500 km of a garden show a "Tropical storm watch" banner as context only; NWS alerts stay the trigger
 * for urgent tasks.
 */
import { haversineKm } from "../engine/geo";
import { cached, fetchJson, fixture, liveOrFixture } from "./base";

export interface Storm { id: string; name: string; classification: string; lat: number; lon: number; intensity_kt: number | null; url: string | null }

interface NhcJson { activeStorms?: { id: string; name: string; classification: string; latitudeNumeric?: number; longitudeNumeric?: number; intensity?: string; publicAdvisory?: { url?: string } }[] }

const parse = (j: NhcJson): Storm[] => (j.activeStorms ?? []).filter((s) => s.latitudeNumeric != null && s.longitudeNumeric != null).map((s) => ({
  id: s.id, name: s.name, classification: s.classification, lat: s.latitudeNumeric!, lon: s.longitudeNumeric!,
  intensity_kt: s.intensity ? Number(s.intensity) : null, url: s.publicAdvisory?.url ?? null,
}));

export async function getStorms(): Promise<{ storms: Storm[]; source: "live" | "fixture" }> {
  return cached("nhc", 10 * 60_000, async () => {
    const r = await liveOrFixture("nhc", {
      live: async (signal) => parse(await fetchJson<NhcJson>("https://www.nhc.noaa.gov/CurrentStorms.json", { signal })),
      fallback: () => parse(fixture<NhcJson>("nhc_storms.json")),
    });
    return { storms: r.data, source: r.source };
  });
}

export const STORM_CONTEXT_KM = 500;

export function nearbyStorms(storms: Storm[], lat: number, lon: number, km = STORM_CONTEXT_KM) {
  return storms.map((s) => ({ ...s, distance_km: Math.round(haversineKm(lat, lon, s.lat, s.lon)) })).filter((s) => s.distance_km <= km).sort((a, b) => a.distance_km - b.distance_km);
}
