/**
 * Container water model (Phase 11.5). A pot has no deep soil to fall back on, so it dries much faster than a bed.
 *   AW (L)        = V_pot (L) × θ_avail                    available water in the pot
 *   use (L/day)   = Kc × ET0 (mm/day) × wall × A_canopy (m²)   (1 mm over 1 m² = 1 L)
 *   wall          = 1.2 on west, southwest or south balconies (hot afternoon walls), else 1
 *   rain          counts only for pots outside the overhang: rain (mm) × pot top area (m²)
 *   water when the pot falls below 50% of AW → days between watering = 0.5 × AW / use
 * Constants are labeled estimates (see BALCONY_CONFIG).
 */
import type { Plant } from "../types";
import { angleDiff } from "./balconySun";

export const BALCONY_CONFIG = {
  _note: "Estimates to verify. Potting mix available water, hot-wall ET0 factor, wet mix density, pot weights.",
  theta_avail: 0.25, // fraction of the pot volume the plant can use (bagged potting mix, estimate)
  hot_wall_factor: 1.2, // ET0 multiplier for west/southwest/south walls on hot afternoons (estimate)
  refill_fraction: 0.5, // water when the pot falls below 50% of AW
  max_canopy_ft: 3, // a pot rarely carries a canopy wider than this
  wet_mix_kg_per_l: 1.0, // wet potting mix density (estimate, verify)
  pot_kg_per_gal: 0.3, // plastic or resin pot (ceramic is several times heavier)
  saucer_l_per_gal: 0.2, // water standing in a saucer after watering
  weight_note_lb: 400, // show "ask your building manager" above this total
} as const;

export const L_PER_GAL = 3.785;
const SQFT_TO_M2 = 0.092903;

/**
 * Typical Tampa Bay reference ET0 by month (mm/day), Jan..Dec. Rounded estimates for planning the typical
 * "summer vs. winter" watering line; the dashboard's next-7-days plan uses the forecast ET0.
 */
export const MONTHLY_ET0_MM = [2.4, 3.0, 4.0, 5.0, 5.6, 5.4, 5.2, 4.9, 4.3, 3.6, 2.8, 2.3];

/** Pot diameter (in) from volume (gal), roughly 6.6 × gal^(1/3): 1 gal ≈ 6.6 in, 5 gal ≈ 11 in, 15 gal ≈ 16 in. */
export const potDiameterIn = (gal: number) => Math.round(6.6 * Math.cbrt(Math.max(0.25, gal)) * 10) / 10;

export const isHotWall = (facingDeg: number | null | undefined) => facingDeg != null && angleDiff(facingDeg, 225) <= 45;

export const availableWaterL = (gal: number, theta = BALCONY_CONFIG.theta_avail) => gal * L_PER_GAL * theta;

/** Canopy area (m²) of a potted plant: mean mature spread, capped for a pot. */
export function canopyM2(p: Pick<Plant, "mature_spread_ft">): number {
  const spread = Math.min(BALCONY_CONFIG.max_canopy_ft, (p.mature_spread_ft[0] + p.mature_spread_ft[1]) / 2);
  return Math.PI * (spread / 2) ** 2 * SQFT_TO_M2;
}

/** Crop coefficient for a pot: mid-season for edibles (a producing plant), the plant's Kc otherwise. */
export const potKc = (p: Pick<Plant, "kc" | "edible">) => p.edible?.kc_stages.mid ?? p.kc;

export function dailyUseL(kc: number, et0: number, canopy_m2: number, hotWall: boolean) {
  return kc * et0 * (hotWall ? BALCONY_CONFIG.hot_wall_factor : 1) * canopy_m2;
}

/** Days between waterings with no rain (0.5 × AW / daily use). */
export function daysBetweenWatering(gal: number, kc: number, et0: number, canopy_m2: number, hotWall: boolean): number {
  const use = dailyUseL(kc, et0, canopy_m2, hotWall);
  if (use <= 0) return Infinity;
  return (BALCONY_CONFIG.refill_fraction * availableWaterL(gal)) / use;
}

/** "daily", "every 2 days", "every 2 to 3 days". */
export function intervalText(days: number): string {
  if (!Number.isFinite(days) || days > 14) return "about every 2 weeks";
  if (days < 1.5) return days < 0.75 ? "daily, twice on the hottest days" : "daily";
  const lo = Math.floor(days);
  const hi = Math.ceil(days);
  return lo === hi || days - lo < 0.25 ? `every ${lo} days` : `every ${lo} to ${hi} days`;
}

export interface PotPlan {
  summer_days: number; // July
  winter_days: number; // January
  summary: string; // "water daily in summer, every 2 to 3 days in winter"
}

export function potPlan(p: Pick<Plant, "kc" | "edible" | "mature_spread_ft">, gal: number, facingDeg: number | null | undefined): PotPlan {
  const hot = isHotWall(facingDeg);
  const kc = potKc(p);
  const c = canopyM2(p);
  const summer = daysBetweenWatering(gal, kc, MONTHLY_ET0_MM[6], c, hot);
  const winter = daysBetweenWatering(gal, kc, MONTHLY_ET0_MM[0], c, hot);
  return { summer_days: summer, winter_days: winter, summary: `water ${intervalText(summer)} in summer, ${intervalText(winter)} in winter` };
}

export interface PotDay { date: string; water: boolean; level_pct: number; rain_l: number }

/**
 * Next days for one pot, starting full: subtract use, add rain only if the pot is outside the overhang,
 * water (refill) when it drops below 50% of AW.
 */
export function potForecast(
  days: { date: string; et0_mm: number; rain_mm: number }[], gal: number, kc: number, canopy_m2: number, hotWall: boolean, open: boolean,
): PotDay[] {
  const aw = availableWaterL(gal);
  const topM2 = Math.PI * ((potDiameterIn(gal) * 0.0254) / 2) ** 2;
  let w = aw;
  return days.map((d) => {
    const rain = open ? d.rain_mm * topM2 : 0;
    w = Math.min(aw, w - dailyUseL(kc, d.et0_mm, canopy_m2, hotWall) + rain);
    const water = w < BALCONY_CONFIG.refill_fraction * aw;
    const level = Math.max(0, w / aw);
    if (water) w = aw;
    return { date: d.date, water, level_pct: Math.round(level * 100), rain_l: Math.round(rain * 100) / 100 };
  });
}
