/**
 * 2. Rain capture and 3. stormwater (spec 6D.3).
 *   Barrel inflow:  V_gal = A_roof × P_in × 0.623 × η   (rain below the first flush is lost)
 *   Barrel:         stored_t = min(B, stored_(t−1) + inflow_t − use_t), use_t = min(demand_t, stored + inflow)
 *   Runoff:         V_runoff = C × P × A per surface (design storm P, default 1 in)
 *   Rain garden:    V_rg = A_rg × d_pond + A_rg × D_soil × n
 *   Suggested area: A_rg = (C × P × A_connected) / (d_pond + D_soil × n)
 */
import { C, inchesToGallons } from "./coef";
import type { ClimateDay } from "./climate";

export interface BarrelResult { captured_gal: number; used_gal: number; overflow_days: number; empty_days: number; overflow_gal: number }

export function roofInflowGal(roofSqft: number, year: ClimateDay[]): number[] {
  const ff = C("first_flush_in");
  const eta = C("roof_collection_efficiency");
  return year.map((d) => inchesToGallons(Math.max(0, d.rain_mm / 25.4 - ff), roofSqft) * eta);
}

/** Day-by-day barrel of capacity B. `captured` = water that entered and stayed (inflow minus overflow). */
export function simulateBarrel(capacityGal: number, inflow: number[], demand: number[]): BarrelResult {
  let stored = 0;
  const r: BarrelResult = { captured_gal: 0, used_gal: 0, overflow_days: 0, empty_days: 0, overflow_gal: 0 };
  for (let t = 0; t < inflow.length; t++) {
    const avail = stored + inflow[t];
    const use = Math.min(demand[t] ?? 0, avail);
    let next = avail - use;
    if (next > capacityGal) {
      r.overflow_days++;
      r.overflow_gal += next - capacityGal;
      next = capacityGal;
    }
    r.captured_gal += inflow[t];
    r.used_gal += use;
    if (next <= 1e-9) r.empty_days++;
    stored = next;
  }
  r.captured_gal -= r.overflow_gal;
  return r;
}

/** Standard 55 gal barrels, 1 to 4 linked together. */
export const BARREL_SIZES = [55, 110, 165, 220];

/**
 * Smallest setup that captures most of the usable rain: each added barrel must still add at least 10% more water
 * for the beds than the setup before it (diminishing returns), else stop.
 */
export function suggestBarrel(inflow: number[], demand: number[]): number {
  let pick = BARREL_SIZES[0];
  let used = simulateBarrel(pick, inflow, demand).used_gal;
  for (const b of BARREL_SIZES.slice(1)) {
    const u = simulateBarrel(b, inflow, demand).used_gal;
    if (u < used * 1.1) break;
    pick = b;
    used = u;
  }
  return pick;
}

export const barrelLabel = (gal: number) => (gal <= 55 ? `a ${gal} gal rain barrel` : `${Math.round(gal / 55)} linked rain barrels (${gal} gal)`);

export type SurfaceKind = "roof" | "driveway" | "patio" | "path" | "lawn" | "bed" | "rain_garden";
const runoffC = (k: SurfaceKind) => (C("runoff_c") as Record<SurfaceKind, number>)[k];

export const runoffGal = (kind: SurfaceKind, sqft: number, stormIn = C("design_storm_in")) => runoffC(kind) * inchesToGallons(stormIn, sqft);

/** Rain garden capacity in gallons. */
export function rainGardenGal(areaSqft: number): number {
  const ft3 = areaSqft * C("rain_garden_pond_ft") + areaSqft * C("rain_garden_soil_ft") * C("rain_garden_porosity");
  return ft3 * C("gal_per_ft3");
}

/** Area (sq ft) that holds the design storm from the connected surfaces: A_rg = C·P·A / (d_pond + D_soil·n). */
export function suggestRainGarden(connected: { kind: SurfaceKind; sqft: number }[], stormIn = C("design_storm_in")): number {
  const runoffFt3 = connected.reduce((s, x) => s + runoffC(x.kind) * (stormIn / 12) * x.sqft, 0);
  return runoffFt3 / (C("rain_garden_pond_ft") + C("rain_garden_soil_ft") * C("rain_garden_porosity"));
}

export interface StormResult { rain_gal: number; runoff_gal: number; captured_gal: number; leaving_gal: number; kept_pct: number }

/** Share of the design storm that stays on the property (soaks in or is captured by the barrel and rain garden). */
export function stormwater(areas: { kind: SurfaceKind; sqft: number }[], barrelGal: number, rgSqft: number, stormIn = C("design_storm_in")): StormResult {
  const total = areas.reduce((s, a) => s + a.sqft, 0) + rgSqft;
  const rain = inchesToGallons(stormIn, total);
  const runoff = areas.reduce((s, a) => s + runoffGal(a.kind, a.sqft, stormIn), 0);
  const roofRunoff = areas.filter((a) => a.kind === "roof").reduce((s, a) => s + runoffGal("roof", a.sqft, stormIn), 0);
  const toBarrel = Math.min(barrelGal, roofRunoff);
  const toGarden = Math.min(rainGardenGal(rgSqft), runoff - toBarrel);
  const captured = toBarrel + Math.max(0, toGarden);
  const leaving = Math.max(0, runoff - captured);
  return { rain_gal: rain, runoff_gal: runoff, captured_gal: captured, leaving_gal: leaving, kept_pct: rain > 0 ? 100 * (1 - leaving / rain) : 100 };
}
