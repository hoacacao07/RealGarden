/**
 * 4. Bay-Safe score, 7. pollinators and biodiversity, 8. homegrown food and compost (spec 6D.3). Pure.
 */
import { feedingOf, groupOf, isNative } from "../../catalog";
import type { Plant } from "../../types";
import { mean } from "../growth";
import { C } from "./coef";

// ---------------------------------------------------------------- 4. Bay-Safe (nutrients)

export interface BaySafe { score: number; n_lb_yr: number; reasons: { text: string; delta: number }[] }

/**
 * Yearly nitrogen from each plant's feeding class over its mature canopy area plus kept lawn (rates from config).
 * Score 100 minus penalties (nitrogen per 1,000 sq ft, bare soil) plus rewards (low feeders, mulch, rain garden,
 * compost). The calendar already keeps fertilizer out of the local summer window, which is noted as a reason.
 */
export function baySafe(x: { plants: Plant[]; lawn_sqft: number; total_sqft: number; mulch: boolean; rain_garden_sqft: number; compost_bin: boolean; fert_window: string | null }): BaySafe {
  const rate = C("nitrogen_lb_per_1000sqft_yr") as Record<string, number>;
  const canopy = (p: Plant) => Math.PI * (mean(p.mature_spread_ft) / 2) ** 2;
  const nPlants = x.plants.reduce((s, p) => s + (canopy(p) / 1000) * rate[feedingOf(p)], 0);
  const nLawn = (x.lawn_sqft / 1000) * rate.lawn;
  const n = nPlants + nLawn;
  const reasons: BaySafe["reasons"] = [];
  let score = 100;
  const perK = x.total_sqft > 0 ? (n / x.total_sqft) * 1000 : 0;
  const pen = Math.min(45, Math.round(perK * 12));
  if (pen) { score -= pen; reasons.push({ text: `About ${n.toFixed(1)} lb of nitrogen a year${nLawn > 0.05 ? `, ${Math.round((100 * nLawn) / n)}% of it on the lawn` : ""}`, delta: -pen }); }
  if (!x.mulch) { score -= 15; reasons.push({ text: "Bare soil without mulch lets fertilizer wash off", delta: -15 }); }
  else { score += 5; reasons.push({ text: "Mulched beds hold soil and nutrients", delta: 5 }); }
  const low = x.plants.length ? x.plants.filter((p) => feedingOf(p) === "low").length / x.plants.length : 0;
  if (low >= 0.6) { score += 10; reasons.push({ text: `${Math.round(low * 100)}% of plants need little or no fertilizer`, delta: 10 }); }
  if (x.rain_garden_sqft > 0) { score += 10; reasons.push({ text: "Rain garden filters runoff before it leaves", delta: 10 }); }
  if (x.compost_bin) { score += 5; reasons.push({ text: "Compost instead of synthetic fertilizer", delta: 5 }); }
  if (x.fert_window) reasons.push({ text: `Fertilizer reminders skip the ${x.fert_window} ban`, delta: 0 });
  return { score: Math.max(0, Math.min(100, score)), n_lb_yr: n, reasons };
}

// ---------------------------------------------------------------- 7. pollinators and biodiversity

export interface Pollinators { nectar: number; host: number; host_for: string[]; bloom_months: number; genera: number; native_share: number; score: number }

const POLLINATORS = ["butterflies", "bees", "hummingbirds"];

/** Plant family is not in the catalog yet, so genus count stands in for diversity (labeled in the UI). */
export function pollinators(plants: Plant[]): Pollinators {
  const uniq = [...new Map(plants.map((p) => [p.id, p])).values()];
  const nectar = uniq.filter((p) => p.flower_colors.length && p.wildlife_value.some((w) => POLLINATORS.includes(w))).length;
  const hostFor = [...new Set(uniq.flatMap((p) => p.host_plant_for))];
  const months = new Set(uniq.flatMap((p) => p.bloom_months)).size;
  const genera = new Set(uniq.map((p) => p.scientific_name.split(" ")[0])).size;
  const native = uniq.length ? uniq.filter(isNative).length / uniq.length : 0;
  // Natives still earn host-plant points: they support more specialist insects.
  const nativeHosts = uniq.filter((p) => isNative(p) && p.host_plant_for.length).length;
  const score = Math.min(30, nectar * 8) + Math.min(25, hostFor.length * 12 + nativeHosts * 3) + Math.round((Math.min(12, months) / 12) * 30) + Math.min(15, genera * 2);
  return { nectar, host: uniq.filter((p) => p.host_plant_for.length).length, host_for: hostFor, bloom_months: months, genera, native_share: native, score: Math.min(100, score) };
}

// ---------------------------------------------------------------- 8. food and compost

export interface Food { lb_season: number; crops: { id: string; name: string; lb: number }[]; compost_lb_yr: number; compost_need_ft3: number; compost_share_pct: number | null }

/**
 * Expected harvest: crops from the guide's yield per 10 ft of row (a plant fills `spacing_ft` of row), fruit from
 * yield per plant once old enough. Compost: household scraps → finished compost vs the beds' yearly top-up.
 */
export function food(placed: { plant: Plant; age_years: number }[], edibleBedSqft: number, household: number, compostBin: boolean): Food {
  const by = new Map<string, { id: string; name: string; lb: number }>();
  for (const { plant: p, age_years } of placed) {
    let lb = 0;
    if (p.edible && p.yield_lb_per_10ft != null) lb = (p.yield_lb_per_10ft * Math.max(0.3, p.spacing_ft)) / 10;
    else if (groupOf(p) === "fruit" && p.yield_lb_per_plant != null) lb = age_years + 1 >= (p.years_to_first_fruit ?? 2) ? p.yield_lb_per_plant : 0;
    if (lb <= 0) continue;
    const cur = by.get(p.id) ?? { id: p.id, name: p.common_name, lb: 0 };
    cur.lb += lb;
    by.set(p.id, cur);
  }
  const crops = [...by.values()].sort((a, b) => b.lb - a.lb);
  const compostLb = compostBin ? household * C("kitchen_scraps_lb_person_wk") * 52 * C("compost_yield") : 0;
  const need = (edibleBedSqft * C("bed_compost_in_yr")) / 12;
  return {
    lb_season: crops.reduce((s, c) => s + c.lb, 0), crops, compost_lb_yr: compostLb, compost_need_ft3: need,
    compost_share_pct: need > 0 ? Math.min(100, (100 * compostLb) / C("compost_lb_per_ft3") / need) : null,
  };
}
