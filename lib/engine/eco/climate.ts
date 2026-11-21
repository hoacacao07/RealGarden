/**
 * Typical year (365 days) of rain and reference ET for the eco water models, from the monthly normals in
 * data/sustainability.json. Each month's rain is spread evenly over its usual number of rain days, placed at even
 * intervals. Deterministic, an estimate.
 */
import { CLIMATE } from "./coef";

export interface ClimateDay { month: number; rain_mm: number; et0_mm: number }

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function typicalYear(c: { rain_in: number[]; rain_days: number[]; et0_mm_day: number[] } = CLIMATE): ClimateDay[] {
  const out: ClimateDay[] = [];
  for (let m = 0; m < 12; m++) {
    const n = DAYS[m];
    const k = Math.max(1, Math.min(n, c.rain_days[m]));
    const perRain = (c.rain_in[m] * 25.4) / k;
    const wet = new Set(Array.from({ length: k }, (_, i) => Math.floor(((i + 0.5) * n) / k)));
    for (let d = 0; d < n; d++) out.push({ month: m + 1, rain_mm: wet.has(d) ? perRain : 0, et0_mm: c.et0_mm_day[m] });
  }
  return out;
}
