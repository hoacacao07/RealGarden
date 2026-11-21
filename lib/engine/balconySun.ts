/**
 * Balcony sun hours (Phase 11.5). Sun azimuth A and altitude h every 15 minutes on the 15th of each month.
 * A pot gets direct sun at a step when all three hold:
 *   1. the sun is in front of the balcony:       |A − facing| < 90°
 *   2. the sun is above the clutter at the horizon: h > 5°
 *   3. the sun gets under the overhang:          tan(h) · d_eff / cos(A − facing) < H
 *      d_eff = how far the pot sits behind the overhang's edge (ft): d − (balcony depth − overhang depth); ≤ 0 means the
 *      pot is out in the open and the overhang can't shade it. H = overhang edge height above the top of the pot (ft).
 *      The spec's tan(h) < H / d is this rule for an overhang covering the whole balcony with the sun straight ahead;
 *      dividing by cos(A − facing) accounts for sun coming in at an angle, which travels further under the overhang.
 * Direct sun hours per month = passing steps / 4. ≥ 6 h full sun, 3 to 6 h partial shade, < 3 h shade.
 */
import type { BalconyFacts, Light, Mount } from "../types";
import { sunPosition } from "./sunpos";

export const STEP_MIN = 15;
export const MIN_ALT_DEG = 5;
/** Height of the top of the pot (ft) by where it sits. Estimates. */
export const POT_TOP_FT: Record<Mount, number> = { floor: 1.5, railing: 3.5, hanging: 6 };
/** Distance from the railing (ft) for railing planters and hanging baskets. */
export const RAILING_D_FT = 0.5;
const RAD = Math.PI / 180;

export type BalconyGeom = Pick<BalconyFacts, "facing_deg" | "balcony_w_ft" | "overhang_depth_ft" | "overhang_height_ft">;

/** Smallest angle between two bearings, 0..180. */
export const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** True if a pot at `d_ft` from the railing (top at `potTopFt`) gets direct sun with the sun at (azimuth, altitude). */
export function directSun(g: BalconyGeom, d_ft: number, potTopFt: number, azimuthDeg: number, altitudeDeg: number): boolean {
  const facing = g.facing_deg ?? 180;
  const dA = angleDiff(azimuthDeg, facing);
  if (dA >= 90 || altitudeDeg <= MIN_ALT_DEG) return false;
  const depth = g.overhang_depth_ft ?? 0;
  if (depth <= 0 || g.overhang_height_ft == null) return true;
  const dEff = d_ft - Math.max(0, (g.balcony_w_ft ?? depth) - depth);
  if (dEff <= 0) return true;
  const H = g.overhang_height_ft - potTopFt;
  if (H <= 0) return false;
  return (Math.tan(altitudeDeg * RAD) * dEff) / Math.cos(dA * RAD) < H;
}

/** Direct sun hours on the 15th of `month` (1..12) for one pot. Steps over the local day (by longitude). */
export function sunHours(lat: number, lon: number, g: BalconyGeom, month: number, d_ft: number, potTopFt = POT_TOP_FT.floor, year = 2026): number {
  const localMidnight = Date.UTC(year, month - 1, 15) - (lon / 15) * 3600e3;
  let n = 0;
  for (let i = 0; i < (24 * 60) / STEP_MIN; i++) {
    const p = sunPosition(localMidnight + i * STEP_MIN * 60e3, lat, lon);
    if (directSun(g, d_ft, potTopFt, p.azimuth_deg, p.altitude_deg)) n++;
  }
  return (n * STEP_MIN) / 60;
}

export const lightFromHours = (h: number): Light => (h >= 6 ? "full_sun" : h >= 3 ? "partial_shade" : "full_shade");

/** Hours for all 12 months. */
export function sunStrip(lat: number, lon: number, g: BalconyGeom, d_ft: number, potTopFt = POT_TOP_FT.floor): number[] {
  return Array.from({ length: 12 }, (_, i) => sunHours(lat, lon, g, i + 1, d_ft, potTopFt));
}

/** A typical floor pot: halfway back on the balcony. */
export const typicalPotD = (g: Pick<BalconyFacts, "balcony_w_ft">) => (g.balcony_w_ft ?? 4) / 2;

export function potDistance(mount: Mount | null | undefined, y_ft: number) {
  return mount === "railing" || mount === "hanging" ? RAILING_D_FT : Math.max(0, y_ft);
}

const DIRS = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
export const facingName = (deg: number) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** Median of the monthly values. */
export function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Light category for the recommender: the median month for a typical pot. */
export function balconyLight(strip: number[]): Light {
  return lightFromHours(median(strip));
}

/** "West balcony: 4 to 5 h of hot afternoon sun most of the year" (25th to 75th percentile of the months, rounded). */
export function sunSummary(facingDeg: number, strip: number[]): string {
  const s = [...strip].sort((a, b) => a - b);
  const lo = Math.round(s[2]);
  const hi = Math.round(s[8]);
  const dir = facingName(facingDeg);
  const f = (((facingDeg % 360) + 360) % 360);
  const kind = f > 202.5 && f < 337.5 ? "hot afternoon" : f > 22.5 && f < 157.5 ? "gentle morning" : f >= 157.5 && f <= 202.5 ? "midday" : "direct";
  if (hi < 1) return `${dir} balcony: little or no direct sun most of the year`;
  return `${dir} balcony: ${lo === hi ? lo : `${lo} to ${hi}`} h of ${kind} sun most of the year`;
}

/**
 * How deep (ft from the railing) direct sun reaches across the floor at a given moment, for the canvas shading.
 * 0 = no direct sun on the floor; the balcony depth = the whole floor is lit.
 */
export function litDepth(g: BalconyGeom, azimuthDeg: number, altitudeDeg: number): number {
  const W = g.balcony_w_ft ?? 4;
  const facing = g.facing_deg ?? 180;
  const dA = angleDiff(azimuthDeg, facing);
  if (dA >= 90 || altitudeDeg <= MIN_ALT_DEG) return 0;
  const depth = g.overhang_depth_ft ?? 0;
  if (depth <= 0 || g.overhang_height_ft == null) return W;
  const open = Math.max(0, W - depth);
  const reach = (g.overhang_height_ft * Math.cos(dA * RAD)) / Math.tan(altitudeDeg * RAD);
  return Math.min(W, open + reach);
}

/** Sun position at a local clock hour on the 15th of a month (Eastern time, daylight saving Mar to Oct; approximate). */
export function sunAtLocalHour(lat: number, lon: number, month: number, hour: number, year = 2026) {
  const utcOffset = month >= 3 && month <= 10 ? 4 : 5;
  return sunPosition(Date.UTC(year, month - 1, 15, hour + utcOffset), lat, lon);
}
