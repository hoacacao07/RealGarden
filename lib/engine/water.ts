/**
 * FAO-56 style daily root-zone water balance, per irrigation zone.
 * Units: depths mm, root depth Zr m, θ volumetric fraction (m³/m³), ET0 mm/day.
 *   TAW = 1000·(θ_fc − θ_wp)·Zr        total available water (mm), soil-type table
 *   TAW = 1000·AWC·Zr                   when the soil survey gives AWC (cm/cm), which replaces θ_fc − θ_wp
 *   RAW = 0.5·TAW                       readily available water (mm)
 *   Dr_t = clamp(Dr_(t−1) − P_eff − I + Kc·ET0, 0, TAW)
 *   P_eff = 0 if rain < 2 mm, else 0.8·rain
 */
import type { Soil } from "../types";

export const SOIL_THETA: Record<Soil, { fc: number; wp: number }> = {
  sand: { fc: 0.1, wp: 0.04 },
  sandy_loam: { fc: 0.18, wp: 0.08 },
  loam: { fc: 0.27, wp: 0.12 },
  muck: { fc: 0.45, wp: 0.2 },
};
export const MM_PER_INCH = 25.4;
export const GAL_PER_INCH_SQFT = 0.623; // 1 in over 1 sq ft
export const SKIP_RAIN_MM = 6;
export const ESTABLISHING_KC = 1.3;
export const TURF_KC = 0.8;
export const TURF_ROOT_IN = 6;
/** Irrigation days for the turf baseline and the usual timer (UTC getDay: 3 = Wed, 6 = Sat). */
export const TIMER_WEEKDAYS = [3, 6];
/** Largest single watering by irrigation type (mm). */
export const IRRIGATION_CAP_MM = { drip: 15, spray: 25, none: 20 } as const;

export interface ZonePlant { kc: number; root_depth_in: number; canopy_sqft: number; establishing: boolean }
export interface WaterInputDay { date: string; rain_mm: number; et0_mm: number }
export interface ZoneParams { zr_m: number; taw_mm: number; raw_mm: number; kc: number }

export interface WaterDayResult {
  date: string;
  rain_mm: number;
  et0_mm: number;
  etc_mm: number;
  irrigation_mm: number;
  depletion_mm: number;
  recommendation: "water" | "skip" | "none";
  reason: string;
  is_forecast: boolean;
}

export const mmToGal = (mm: number, areaSqft: number) => (mm / MM_PER_INCH) * areaSqft * GAL_PER_INCH_SQFT;

export const effectiveRain = (rainMm: number) => (rainMm < 2 ? 0 : 0.8 * rainMm);

/** Canopy-weighted root depth and Kc (×1.3 for plants in their first 12 months). AWC (cm/cm) overrides the soil table. */
export function zoneParams(plants: ZonePlant[], soil: Soil, awc: number | null = null): ZoneParams {
  const th = SOIL_THETA[soil];
  let zrIn = 12;
  let kc = 0.5;
  if (plants.length) {
    const w = plants.map((p) => Math.max(p.canopy_sqft, 0.01));
    const tot = w.reduce((a, b) => a + b, 0);
    zrIn = plants.reduce((s, p, i) => s + p.root_depth_in * w[i], 0) / tot;
    kc = plants.reduce((s, p, i) => s + p.kc * (p.establishing ? ESTABLISHING_KC : 1) * w[i], 0) / tot;
  }
  const zr_m = (zrIn * 25.4) / 1000;
  const awcFrac = awc != null && awc > 0 && awc < 1 ? awc : th.fc - th.wp;
  const taw = 1000 * awcFrac * zr_m;
  return { zr_m, taw_mm: taw, raw_mm: 0.5 * taw, kc };
}

/** One day: Dr_t = clamp(Dr_(t−1) − P_eff − I + ETc, 0, TAW). */
export function step(drPrev: number, rainMm: number, irrMm: number, etcMm: number, tawMm: number): number {
  return Math.min(Math.max(drPrev - effectiveRain(rainMm) - irrMm + etcMm, 0), tawMm);
}

/** Replay past days assuming the plan was followed: refill (capped) on days after Dr passed RAW. */
export function simulateHistory(days: WaterInputDay[], p: ZoneParams, capMm: number, dr0 = 0): WaterDayResult[] {
  let dr = dr0;
  return days.map((d) => {
    const irr = dr > p.raw_mm ? Math.min(dr, capMm) : 0;
    const etc = p.kc * d.et0_mm;
    dr = step(dr, d.rain_mm, irr, etc, p.taw_mm);
    return { ...d, etc_mm: etc, irrigation_mm: irr, depletion_mm: dr, recommendation: irr > 0 ? "water" : "none", reason: "", is_forecast: false };
  });
}

function run(dr0: number, days: WaterInputDay[], irr: number[], p: ZoneParams): number[] {
  let dr = dr0;
  return days.map((d, i) => (dr = step(dr, d.rain_mm, irr[i], p.kc * d.et0_mm, p.taw_mm)));
}

const weekday = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Simulate up to 7 forecast days with no watering. If Dr would pass RAW on day k, water on day k−1
 * (enough to refill, capped), unless ≥ 6 mm of rain is forecast on day k or k+1 — then skip.
 * Repeats until no further crossing. `pause` (storm) turns every day into "none" with a reason.
 */
export function forecastPlan(drToday: number, days: WaterInputDay[], p: ZoneParams, capMm: number, pause = false): WaterDayResult[] {
  const n = days.length;
  const irr = new Array<number>(n).fill(0);
  const rec = new Array<WaterDayResult["recommendation"]>(n).fill("none");
  const why = new Array<string>(n).fill(pause ? "Paused: storm warning in effect" : "");
  if (!pause) {
    let start = 0;
    while (start < n) {
      const dr = run(drToday, days, irr, p);
      let k = -1;
      for (let i = start; i < n; i++) if (dr[i] > p.raw_mm) { k = i; break; }
      if (k < 0) break;
      const rainK = days[k].rain_mm;
      const rainK1 = k + 1 < n ? days[k + 1].rain_mm : 0;
      if (rainK >= SKIP_RAIN_MM || rainK1 >= SKIP_RAIN_MM) {
        rec[k] = "skip";
        why[k] = `Rain expected: ${(Math.max(rainK, rainK1) / MM_PER_INCH).toFixed(1)} in`;
        start = k + 1;
        continue;
      }
      const j = Math.max(k - 1, start);
      const before = j > 0 ? dr[j - 1] : drToday;
      const need = before + p.kc * days[j].et0_mm - effectiveRain(days[j].rain_mm);
      irr[j] = Math.round(Math.min(Math.max(need, 0), capMm) * 10) / 10;
      rec[j] = "water";
      why[j] = `Soil passes the stress line (${Math.round(p.raw_mm)} mm) by ${DOW[weekday(days[k].date)]}`;
      start = j + 1;
    }
    // Timer days: on the usual Wed/Sat timer run with ≥ 6 mm rain that day or next, say skip.
    for (let i = 0; i < n; i++) {
      if (rec[i] !== "none" || !TIMER_WEEKDAYS.includes(weekday(days[i].date))) continue;
      const rain = Math.max(days[i].rain_mm, i + 1 < n ? days[i + 1].rain_mm : 0);
      if (rain >= SKIP_RAIN_MM) {
        rec[i] = "skip";
        why[i] = `Rain expected: ${(rain / MM_PER_INCH).toFixed(1)} in. Turn off the timer's usual run`;
      }
    }
  }
  let dr = drToday;
  return days.map((d, i) => {
    const etc = p.kc * d.et0_mm;
    dr = step(dr, d.rain_mm, irr[i], etc, p.taw_mm);
    return { ...d, etc_mm: etc, irrigation_mm: irr[i], depletion_mm: dr, recommendation: rec[i], reason: why[i], is_forecast: true };
  });
}

/**
 * Turf baseline on the same area: Kc 0.8, 6 in roots, timer twice a week (Wed, Sat) refilling the
 * root zone regardless of rain in the forecast. Returns mm applied per day.
 */
export function turfIrrigationMm(days: WaterInputDay[], soil: Soil): number[] {
  const tp = zoneParams([{ kc: TURF_KC, root_depth_in: TURF_ROOT_IN, canopy_sqft: 1, establishing: false }], soil);
  let dr = 0;
  return days.map((d) => {
    const etc = TURF_KC * d.et0_mm;
    const irr = TIMER_WEEKDAYS.includes(weekday(d.date)) ? Math.max(0, dr + etc - effectiveRain(d.rain_mm)) : 0;
    dr = step(dr, d.rain_mm, irr, etc, tp.taw_mm);
    return irr;
  });
}

export interface ZonePlan {
  params: ZoneParams;
  days: WaterDayResult[]; // history then forecast
  forecast: WaterDayResult[];
  saved_gal_week: number; // turf baseline minus this plan over the forecast week
  saved_gal_history: number;
}

/** Full plan for a zone: replay history to get today's Dr, then plan the forecast week. */
export function planZone(
  plants: ZonePlant[], soil: Soil, areaSqft: number, capMm: number,
  history: WaterInputDay[], forecast: WaterInputDay[], pause = false, awc: number | null = null,
): ZonePlan {
  const params = zoneParams(plants, soil, awc);
  const hist = simulateHistory(history, params, capMm);
  const drToday = hist.length ? hist[hist.length - 1].depletion_mm : 0;
  const fc = forecastPlan(drToday, forecast, params, capMm, pause);
  const turf = turfIrrigationMm([...history, ...forecast], soil);
  const mine = [...hist, ...fc].map((d) => d.irrigation_mm);
  const diff = turf.map((t, i) => mmToGal(t - mine[i], areaSqft));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    params, days: [...hist, ...fc], forecast: fc,
    saved_gal_history: Math.max(0, sum(diff.slice(0, hist.length))),
    saved_gal_week: Math.max(0, sum(diff.slice(hist.length))),
  };
}

