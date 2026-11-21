/**
 * 6. Shade and cooling (spec 6D.3). Reuses the sun position engine from Balcony mode. Each tree's crown is a disc of
 * its canopy radius at its crown height (0.6 × tree height) at year t; its shadow lands opposite the sun at
 * distance crown_h / tan(altitude). Every 15 minutes from 12 PM to 6 PM on mid-June, mid-July and mid-August days we
 * count the share of sample points on the west and south walls (when the sun faces them) that fall in a shadow.
 * Result: average shaded wall-hours per summer afternoon, and a low / medium / high tier (no energy dollars).
 * Canvas feet, north is up (−y), east is +x.
 */
import { sunPosition } from "../sunpos";
import { C } from "./coef";

export interface Tree { id: string; x_ft: number; y_ft: number; radius_ft: number; height_ft: number }
export interface House { x: number; y: number; w: number; h: number }
export type ShadeTier = "low" | "medium" | "high";

const DAYS = ["06-15", "07-15", "08-15"];
const SAMPLES = 5;
/** Eastern daylight time is UTC−4 in summer. */
const UTC_OFFSET_H = 4;

function wallPoints(h: House) {
  const west = Array.from({ length: SAMPLES }, (_, i) => ({ x: h.x, y: h.y + ((i + 0.5) * h.h) / SAMPLES }));
  const south = Array.from({ length: SAMPLES }, (_, i) => ({ x: h.x + ((i + 0.5) * h.w) / SAMPLES, y: h.y + h.h }));
  return { west, south };
}

export function wallShadeHours(trees: Tree[], house: House, lat: number, lon: number, year = 2026): { west: number; south: number; total: number } {
  const pts = wallPoints(house);
  let west = 0;
  let south = 0;
  for (const md of DAYS) {
    for (let q = 0; q < 24; q++) {
      const hour = 12 + q * 0.25;
      const ms = Date.parse(`${year}-${md}T00:00:00Z`) + (hour + UTC_OFFSET_H) * 3600e3;
      const s = sunPosition(ms, lat, lon);
      if (s.altitude_deg <= 2) continue;
      const az = (s.azimuth_deg * Math.PI) / 180;
      const tanAlt = Math.tan((s.altitude_deg * Math.PI) / 180);
      // Shadow offset direction is opposite the sun: compass (sin, −cos) of az + 180° = (−sin az, cos az).
      const shadows = trees.map((t) => {
        const L = (0.6 * t.height_ft) / tanAlt;
        return { x: t.x_ft - Math.sin(az) * L, y: t.y_ft + Math.cos(az) * L, r: t.radius_ft };
      });
      const shaded = (p: { x: number; y: number }) => shadows.some((sh) => (p.x - sh.x) ** 2 + (p.y - sh.y) ** 2 <= sh.r * sh.r);
      // The west wall gets sun when the sun is in the west half of the sky; the south wall when it's in the south half.
      if (s.azimuth_deg > 180) west += (pts.west.filter(shaded).length / SAMPLES) * 0.25;
      if (s.azimuth_deg > 90 && s.azimuth_deg < 270) south += (pts.south.filter(shaded).length / SAMPLES) * 0.25;
    }
  }
  const n = DAYS.length;
  return { west: west / n, south: south / n, total: (west + south) / n };
}

export function shadeTier(hoursPerDay: number): ShadeTier {
  const t = C("shade_tiers_wall_hours_day") as { medium: number; high: number };
  return hoursPerDay >= t.high ? "high" : hoursPerDay >= t.medium ? "medium" : "low";
}

/** A spot just west of the house (middle of the west wall), `gap` ft from the wall. */
export const westSpot = (house: House, radius: number, gap = 4) => ({ x_ft: house.x - radius - gap, y_ft: house.y + house.h / 2 });
