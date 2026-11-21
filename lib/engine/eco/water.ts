/**
 * 1. Water footprint (spec 6D.3). Typical-year daily root-zone bucket per planted area (same FAO-56 logic as the
 * dashboard's water engine): Dr_t = clamp(Dr_(t−1) + Kc·ET0 − P_eff, 0, TAW); irrigate back to zero when Dr > RAW;
 * gross water = net / application efficiency. mm → gal with 1 mm over 1 ft² = 0.623 / 25.4 gal.
 * Baseline: the same area as irrigated turf (Kc_turf, 6 in roots, spray).
 */
import type { Soil } from "../../types";
import { effectiveRain, SOIL_THETA } from "../water";
import { C, mmToGallons } from "./coef";
import type { ClimateDay } from "./climate";

export interface Bucket { kc: number; root_in: number; area_sqft: number; efficiency: number }

/** Daily gross irrigation (mm over the area) for a typical year. */
export function irrigationDays(b: Bucket, soil: Soil, year: ClimateDay[], awc: number | null = null, potted = false): number[] {
  const th = SOIL_THETA[soil];
  const zr = (b.root_in * 25.4) / 1000;
  const taw = 1000 * (awc ?? th.fc - th.wp) * zr;
  const raw = 0.5 * taw;
  let dr = 0;
  return year.map((d) => {
    // Pots under an overhang get no rain (balconies): potted = true.
    const p = potted ? 0 : effectiveRain(d.rain_mm);
    dr = Math.min(taw, Math.max(0, dr + b.kc * d.et0_mm - p));
    if (dr > raw) {
      const net = dr;
      dr = 0;
      return net / b.efficiency;
    }
    return 0;
  });
}

export const turfBucket = (area_sqft: number): Bucket => ({ kc: C("kc_turf"), root_in: C("turf_root_in"), area_sqft, efficiency: C("spray_efficiency") });

/** Gallons per day for a bucket (gross irrigation × area). */
export const dailyGallons = (b: Bucket, soil: Soil, year: ClimateDay[], awc: number | null = null, potted = false) =>
  irrigationDays(b, soil, year, awc, potted).map((mm) => mmToGallons(mm, b.area_sqft));

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
