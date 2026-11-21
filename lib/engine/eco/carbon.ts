/**
 * 5. Carbon (spec 6D.3). Woody plants only (trees, shrubs, palms, woody vines):
 *   seq(t) = seq_mature × (h(t) / H)²     h from the logistic growth curve, H = mean mature height
 * seq_mature per species or per category from config (kg CO₂/yr). Herbaceous plants and vegetables store nothing
 * long term. Avoided mowing for lawn turned into beds. Miles-not-driven equivalent from a config factor.
 */
import type { Plant } from "../../types";
import { heightAt, mean } from "../growth";
import { C } from "./coef";

const TABLE = () => C("co2_mature_kg_yr") as Record<string, number>;

export function seqMature(p: Plant): number {
  if (p.co2_mature_kg_yr != null) return p.co2_mature_kg_yr;
  const t = TABLE();
  if (t[p.id] != null) return t[p.id];
  if (!p.woody && p.category !== "vine") return 0;
  if (p.category === "vine" && !p.woody) return p.id === "muscadine_grape" ? t.vine : 0;
  return t[p.category] ?? 0;
}

/** kg CO₂ in year `ageYears` of a plant's life. */
export function seqAt(p: Plant, ageYears: number): number {
  const s = seqMature(p);
  if (!s) return 0;
  const ratio = heightAt(p, ageYears) / mean(p.mature_height_ft);
  return s * ratio * ratio;
}

export interface CarbonResult { kg_yr: number; kg_10yr: number; mowing_avoided_kg_yr: number; miles_10yr: number }

/**
 * Yearly CO₂ at `yearsAhead` from now and the total over the next 10 years for the placed plants (ages today),
 * plus avoided mowing emissions for `avoidedLawnSqft`.
 */
export function carbon(placed: { plant: Plant; age_years: number }[], avoidedLawnSqft: number, yearsAhead = 1): CarbonResult {
  const mow = (avoidedLawnSqft / 1000) * C("mowing_kg_co2_per_1000sqft_yr");
  const yearKg = (ahead: number) => placed.reduce((s, x) => s + seqAt(x.plant, x.age_years + ahead), 0);
  let ten = 0;
  for (let y = 1; y <= 10; y++) ten += yearKg(y) + mow;
  return { kg_yr: yearKg(yearsAhead) + mow, kg_10yr: ten, mowing_avoided_kg_yr: mow, miles_10yr: ten / C("kg_co2_per_mile") };
}
