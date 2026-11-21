/**
 * Eco report (Phase 11.7): the 8 metrics, sub-scores, the Eco score A to F (weighted mean of sub-scores 1 to 7 with
 * weights from config; metrics that can't be computed are left out and the rest re-weighted), greener swaps ranked by
 * how much they raise the score, and the comparison with a typical lawn yard. Pure: the page, the report card, the
 * chatbot tool and the tests all call this.
 */
import { groupOf, isBlocked } from "../../catalog";
import type { EcoLayer, GardenDoc, Plant, PlacementInput } from "../../types";
import { polygonArea, pointInPolygon, yearsBetween } from "../geo";
import { heightAt, mean, spreadAt } from "../growth";
import { hardFilter, type SuggestCtx } from "../suggest";
import { fertRuleFor } from "../tasks";
import { zoneForLat } from "../zone";
import { carbon, type CarbonResult } from "./carbon";
import { C, coefRefs, galPerMmSqft, type CoefKey } from "./coef";
import { typicalYear } from "./climate";
import { baySafe, food, pollinators, type BaySafe, type Food, type Pollinators } from "./nature";
import { barrelLabel, roofInflowGal, simulateBarrel, stormwater, suggestBarrel, suggestRainGarden, type BarrelResult, type StormResult, type SurfaceKind } from "./rain";
import { shadeTier, wallShadeHours, type ShadeTier, type Tree } from "./shade";
import { dailyGallons, sum, turfBucket, type Bucket } from "./water";

export type MetricId = "water" | "rain" | "stormwater" | "baysafe" | "carbon" | "shade" | "pollinators" | "food";
export type ScoreId = Exclude<MetricId, "food">;

export interface Metric {
  id: MetricId;
  title: string;
  value: string; // headline, e.g. "4,200 gal/yr"
  detail: string;
  score: number | null; // 0..100, null = not computed (no house drawn, balcony)
  /** Number used for "changed since last visit". */
  raw: number | null;
  unit: string;
  formula: string;
  coefs: ReturnType<typeof coefRefs>;
  needs?: string; // what to add to compute it
}

export type SwapAction =
  | { type: "replace_plant"; from: string; to: string }
  | { type: "convert_lawn"; sqft: number }
  | { type: "barrel"; gal: number }
  | { type: "rain_garden"; sqft: number }
  | { type: "move"; placement_id: string; x_ft: number; y_ft: number }
  | { type: "add_plant"; plant_id: string; spots: { x_ft: number; y_ft: number; zone_id: string | null }[] };

export interface Swap { id: string; title: string; detail: string; delta: number; action: SwapAction }

export interface EcoReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: Metric[];
  balcony: boolean;
  has_house: boolean;
  years_ahead: number;
  water: { design_gal: number; baseline_gal: number; saved_gal: number; rain_share_pct: number };
  barrel: (BarrelResult & { capacity_gal: number; suggested_gal: number; roof_sqft: number }) | null;
  storm: (StormResult & { suggested_rg_sqft: number; rg_gal: number }) | null;
  bay: BaySafe;
  carbon: CarbonResult;
  shade: { hours_day: number; tier: ShadeTier; west: number; south: number } | null;
  pollinators: Pollinators;
  food: Food;
}

export interface EcoInput {
  garden: GardenDoc;
  plants: Plant[];
  eco: EcoLayer;
  today: string;
  yearsAhead?: number;
}

const r0 = (v: number) => Math.round(v);
const fmt = (v: number) => r0(v).toLocaleString("en-US");
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function gradeFor(score: number): EcoReport["grade"] {
  const g = C("grade_cutoffs") as Record<"A" | "B" | "C" | "D", number>;
  return score >= g.A ? "A" : score >= g.B ? "B" : score >= g.C ? "C" : score >= g.D ? "D" : "F";
}

/** Weighted mean of the sub-scores that exist. */
export function ecoScore(scores: Partial<Record<ScoreId, number | null>>): number {
  const w = C("eco_score_weights") as Record<ScoreId, number>;
  let num = 0;
  let den = 0;
  for (const k of Object.keys(w) as ScoreId[]) {
    const s = scores[k];
    if (s == null) continue;
    num += w[k] * s;
    den += w[k];
  }
  return den ? Math.round(num / den) : 0;
}

interface Placed { id: string; plant: Plant; x_ft: number; y_ft: number; zone_id: string | null; age_years: number }

function placedOf(g: GardenDoc, byId: Map<string, Plant>, today: string): Placed[] {
  return g.placements.filter((p) => byId.has(p.plant_id)).map((p) => {
    const zone = p.zone_id && g.zones.some((z) => z.id === p.zone_id) ? p.zone_id : g.zones.find((z) => pointInPolygon(p.x_ft, p.y_ft, z.polygon))?.id ?? null;
    return { id: p.id, plant: byId.get(p.plant_id)!, x_ft: p.x_ft, y_ft: p.y_ft, zone_id: zone, age_years: yearsBetween(p.planted_on, today) };
  });
}

/** Mature planted bucket for a zone: canopy-weighted Kc and roots, plus bare mulched soil for the uncovered part. */
function zoneBucket(area: number, plants: Plant[], irrigation: string, edible: boolean): Bucket {
  const eff = irrigation === "spray" ? C("spray_efficiency") : C("drip_efficiency");
  if (!plants.length) return { kc: 0.15, root_in: 12, area_sqft: area, efficiency: eff };
  const can = plants.map((p) => Math.PI * (mean(p.mature_spread_ft) / 2) ** 2);
  const tot = sum(can);
  // Crops grow for part of the year only: their mid-season Kc counts for about 60% of the year.
  const kcOf = (p: Plant) => (p.edible ? p.edible.kc_stages.mid * 0.6 : p.kc);
  const kcPlants = sum(plants.map((p, i) => kcOf(p) * can[i])) / tot;
  const root = sum(plants.map((p, i) => p.root_depth_in * can[i])) / tot;
  const cover = Math.min(1, tot / area);
  return { kc: kcPlants * cover + 0.15 * (1 - cover), root_in: edible ? Math.min(root, 12) : root, area_sqft: area, efficiency: eff };
}

export function ecoReport(x: EcoInput): EcoReport {
  const { garden: g, eco } = x;
  const ahead = x.yearsAhead ?? 1;
  const byId = new Map(x.plants.map((p) => [p.id, p]));
  const placed = placedOf(g, byId, x.today);
  const balcony = g.site.kind === "balcony";
  const year = typicalYear();
  const awc = g.site.soil_source && g.site.soil_source !== "unknown" ? g.site.awc ?? null : null;
  const house = balcony ? null : eco.house;
  const metrics: Metric[] = [];

  // ---------------------------------------------------------------- 1. water
  let daily: number[];
  let baseline = 0;
  let bedArea = 0;
  let edibleArea = 0;
  if (balcony) {
    // Pots: Kc × ET0 over each plant's canopy every day (no rain under the overhang), vs the same pots at Kc 1.
    const gpm = galPerMmSqft();
    const can = (p: Plant) => Math.max(1, Math.PI * (spreadAt(p, 3) / 2) ** 2);
    daily = year.map((d) => sum(placed.map((pp) => pp.plant.kc * d.et0_mm * can(pp.plant) * gpm)));
    baseline = sum(year.map((d) => sum(placed.map((pp) => 1 * d.et0_mm * can(pp.plant) * gpm))));
  } else {
    daily = year.map(() => 0);
    for (const z of g.zones) {
      const area = polygonArea(z.polygon);
      bedArea += area;
      if (z.kind === "edible") edibleArea += area;
      const b = zoneBucket(area, placed.filter((p) => p.zone_id === z.id).map((p) => p.plant), z.irrigation, z.kind === "edible");
      dailyGallons(b, g.site.soil, year, awc).forEach((v, i) => (daily[i] += v));
    }
    // Lawn turned into a pollinator bed: mostly natives on drip once established.
    if (eco.converted_lawn_sqft > 0) {
      dailyGallons({ kc: 0.4, root_in: 16, area_sqft: eco.converted_lawn_sqft, efficiency: C("drip_efficiency") }, g.site.soil, year, awc).forEach((v, i) => (daily[i] += v));
    }
    if (eco.lawn_sqft > 0) dailyGallons(turfBucket(eco.lawn_sqft), g.site.soil, year, awc).forEach((v, i) => (daily[i] += v));
    baseline = sum(dailyGallons(turfBucket(bedArea + eco.lawn_sqft + eco.converted_lawn_sqft), g.site.soil, year, awc));
  }
  const design = sum(daily);

  // ---------------------------------------------------------------- 2. rain barrel
  const roof = house ? eco.roof_sqft ?? house.w * house.h : 0;
  let barrel: EcoReport["barrel"] = null;
  if (house && roof > 0) {
    const inflow = roofInflowGal(roof, year);
    const sim = simulateBarrel(eco.barrel_gal, inflow, daily);
    barrel = { ...sim, capacity_gal: eco.barrel_gal, suggested_gal: suggestBarrel(inflow, daily), roof_sqft: roof };
  }
  const rainShare = design > 0 && barrel ? (100 * barrel.used_gal) / design : 0;
  const savedFrac = baseline > 0 ? clamp01(1 - design / baseline) : 1;
  const lowShare = placed.length ? placed.filter((p) => p.plant.water_need !== "high").length / placed.length : 1;
  const waterScore = balcony ? r0(100 * lowShare * clamp01(1 - design / Math.max(1, baseline) + 0.4)) : r0(Math.min(100, (100 * savedFrac) / 0.75 + rainShare * 0.3));
  metrics.push({
    id: "water", title: "Water", unit: "gal/yr", raw: r0(design), score: waterScore,
    value: `${fmt(design)} gal/yr`,
    detail: balcony
      ? `Watering your pots in a typical year. ${Math.round(lowShare * 100)}% of your plants are low or medium water.`
      : `${fmt(Math.max(0, baseline - design))} gal/yr less than the same area as a sprinkler lawn${rainShare >= 1 ? `; rain covers ${r0(rainShare)}% of it` : ""}.`,
    formula: "Daily water balance for a typical year: Dr = Dr(yesterday) + Kc × ET0 − rain; water when Dr passes half the soil's storage. Gallons = mm × sq ft × 0.623 / 25.4. Baseline: the same area as irrigated turf (Kc_turf).",
    coefs: coefRefs("gal_per_inch_sqft", "kc_turf", "turf_root_in", "spray_efficiency", "drip_efficiency"),
  });
  if (!balcony) {
    metrics.push({
      id: "rain", title: "Rain barrel", unit: "gal/yr", raw: barrel ? r0(barrel.used_gal) : null,
      score: barrel ? (barrel.capacity_gal > 0 ? r0(Math.min(100, (100 * barrel.used_gal) / Math.max(1, simulateBarrel(barrel.suggested_gal, roofInflowGal(roof, year), daily).used_gal))) : 0) : null,
      value: !barrel ? "Add your roof" : barrel.capacity_gal ? `${fmt(barrel.used_gal)} gal/yr used` : "No barrel yet",
      detail: !barrel ? "Draw your house to see how much rain your roof could save."
        : barrel.capacity_gal
          ? `${barrelLabel(barrel.capacity_gal).replace(/^a/, "A")} on ${fmt(roof)} sq ft of roof catches ${fmt(barrel.captured_gal)} gal and waters your beds with ${fmt(barrel.used_gal)} gal a year. It overflows on ${barrel.overflow_days} days.`
          : `${barrelLabel(barrel.suggested_gal).replace(/^a/, "A")} would catch most of the usable rain from your ${fmt(roof)} sq ft roof.`,
      formula: "V = A_roof × P_in × 0.623 × η per rain day. Barrel: stored = min(B, stored + inflow − use), simulated day by day for a typical year.",
      coefs: coefRefs("roof_collection_efficiency", "first_flush_in", "gal_per_inch_sqft"),
      needs: barrel ? undefined : "house",
    });
  }

  // ---------------------------------------------------------------- 3. stormwater
  let storm: EcoReport["storm"] = null;
  if (house) {
    const areas: { kind: SurfaceKind; sqft: number }[] = [
      { kind: "roof", sqft: roof }, ...eco.surfaces.map((s) => ({ kind: s.kind as SurfaceKind, sqft: s.sqft })),
      { kind: "lawn", sqft: eco.lawn_sqft }, { kind: "bed", sqft: bedArea + eco.converted_lawn_sqft },
    ];
    const st = stormwater(areas, eco.barrel_gal, eco.rain_garden_sqft);
    const connected = areas.filter((a) => ["roof", "driveway", "patio"].includes(a.kind));
    storm = { ...st, suggested_rg_sqft: Math.ceil(suggestRainGarden(connected) / 10) * 10, rg_gal: st.captured_gal };
  }
  if (!balcony) {
    metrics.push({
      id: "stormwater", title: "Runoff kept on site", unit: "%", raw: storm ? r0(storm.kept_pct) : null,
      score: storm ? r0(100 * clamp01((storm.kept_pct - 40) / 50)) : null,
      value: storm ? `${r0(storm.kept_pct)}% kept` : "Add your house",
      detail: storm ? `In a ${C("design_storm_in")} in storm, about ${fmt(storm.leaving_gal)} gal runs off to the street.${eco.rain_garden_sqft ? "" : ` A ${storm.suggested_rg_sqft} sq ft rain garden would hold the runoff from your roof and driveway.`}` : "Draw your house, driveway and lawn to estimate runoff.",
      formula: "Runoff = C × P × A per surface. Rain garden holds A_rg × d_pond + A_rg × D_soil × n. Suggested A_rg = C × P × A_connected / (d_pond + D_soil × n).",
      coefs: coefRefs("runoff_c", "design_storm_in", "rain_garden_pond_ft", "rain_garden_soil_ft", "rain_garden_porosity"),
      needs: storm ? undefined : "house",
    });
  }

  // ---------------------------------------------------------------- 4. Bay-Safe
  const fert = fertRuleFor(g.site.lat, g.site.lon);
  const [[m1, d1], [m2, d2]] = fert.restricted;
  const bay = baySafe({
    plants: placed.map((p) => p.plant), lawn_sqft: eco.lawn_sqft, total_sqft: Math.max(1, bedArea + eco.lawn_sqft + eco.converted_lawn_sqft + (balcony ? g.site.area_sqft : 0)),
    mulch: eco.mulch, rain_garden_sqft: eco.rain_garden_sqft, compost_bin: eco.compost_bin, fert_window: `${MONTHS[m1 - 1]} ${d1} to ${MONTHS[m2 - 1]} ${d2}`,
  });
  metrics.push({
    id: "baysafe", title: "Bay-Safe", unit: "score", raw: bay.score, score: bay.score, value: `${bay.score} / 100`,
    detail: bay.reasons.slice(0, 2).map((r) => r.text).join(". ") + ".",
    formula: "Nitrogen per year = Σ canopy area × rate for the plant's feeding class + lawn area × lawn rate. Score 100 minus penalties (nitrogen per 1,000 sq ft, bare soil) plus rewards (low feeders, mulch, rain garden, compost).",
    coefs: coefRefs("nitrogen_lb_per_1000sqft_yr"),
  });

  // ---------------------------------------------------------------- 5. carbon
  const co2 = carbon(placed, eco.converted_lawn_sqft, ahead);
  const areaForCarbon = balcony ? Math.max(20, g.site.area_sqft) : Math.max(100, bedArea + eco.converted_lawn_sqft + eco.lawn_sqft);
  const carbonScore = r0(Math.min(100, (100 * co2.kg_10yr) / (areaForCarbon / 100) / C("carbon_target_kg10_per_100sqft")));
  metrics.push({
    id: "carbon", title: "Carbon", unit: "kg CO₂/yr", raw: r0(co2.kg_yr), score: carbonScore,
    value: `${fmt(co2.kg_yr)} kg CO₂/yr`,
    detail: `About ${fmt(co2.kg_10yr)} kg over 10 years, like ${fmt(co2.miles_10yr)} miles not driven.${co2.mowing_avoided_kg_yr > 0 ? ` Includes ${fmt(co2.mowing_avoided_kg_yr)} kg/yr of mowing you no longer do.` : ""}`,
    formula: "Woody plants: seq(t) = seq_mature × (h(t) / H)², with h from the growth curve. Herbaceous plants count 0. Plus avoided mowing on converted lawn. Miles = kg / kg per mile.",
    coefs: coefRefs("co2_mature_kg_yr", "mowing_kg_co2_per_1000sqft_yr", "kg_co2_per_mile"),
  });

  // ---------------------------------------------------------------- 6. shade
  let shade: EcoReport["shade"] = null;
  if (house) {
    const trees: Tree[] = placed.filter((p) => p.plant.woody && mean(p.plant.mature_height_ft) >= 8).map((p) => ({
      id: p.id, x_ft: p.x_ft, y_ft: p.y_ft, radius_ft: spreadAt(p.plant, p.age_years + ahead) / 2, height_ft: heightAt(p.plant, p.age_years + ahead),
    }));
    const h = wallShadeHours(trees, house, g.site.lat, g.site.lon);
    shade = { hours_day: h.total, tier: shadeTier(h.total), west: h.west, south: h.south };
  }
  if (!balcony) {
    metrics.push({
      id: "shade", title: "Shade on the house", unit: "wall-hours/day", raw: shade ? Math.round(shade.hours_day * 10) / 10 : null,
      score: shade ? (shade.tier === "high" ? 100 : shade.tier === "medium" ? 65 : 30) : null,
      value: shade ? `${shade.tier[0].toUpperCase()}${shade.tier.slice(1)} cooling` : "Add your house",
      detail: shade ? `${shade.hours_day.toFixed(1)} shaded wall-hours on the hot west and south walls on a summer afternoon (year ${ahead}).` : "Draw your house to see how your trees shade it in summer.",
      formula: "Sun position every 15 min, 12 to 6 PM, mid-June to mid-August. Each tree's crown casts a disc shadow at crown height / tan(sun altitude), opposite the sun. Counts shaded points on west and south walls. Tiers only, no energy dollars.",
      coefs: coefRefs("shade_tiers_wall_hours_day"),
      needs: shade ? undefined : "house",
    });
  }

  // ---------------------------------------------------------------- 7. pollinators
  const pol = pollinators(placed.map((p) => p.plant));
  metrics.push({
    id: "pollinators", title: "Pollinators", unit: "score", raw: pol.score, score: pol.score,
    value: `${pol.nectar} nectar · ${pol.host} host`,
    detail: `Something blooms ${pol.bloom_months} months of the year.${pol.host_for.length ? ` Caterpillar food for ${pol.host_for.slice(0, 3).join(", ")}.` : " No host plants yet: add one so butterflies can lay eggs."} ${pol.genera} plant genera.`,
    formula: "Nectar plants (flowers that feed butterflies, bees or hummingbirds), host plants (by butterfly species), months with something in bloom, genus diversity (stands in for plant family until the catalog has families).",
    coefs: [],
  });

  // ---------------------------------------------------------------- 8. food and compost
  const fd = food(placed, edibleArea, eco.household, eco.compost_bin);
  metrics.push({
    id: "food", title: "Homegrown food", unit: "lb/season", raw: r0(fd.lb_season), score: null,
    value: fd.lb_season >= 1 ? `${fmt(fd.lb_season)} lb per season` : "No edibles yet",
    detail: (fd.crops.length ? `Mostly ${fd.crops.slice(0, 2).map((c) => c.name.toLowerCase()).join(" and ")}. ` : "") +
      (eco.compost_bin ? `Your compost bin makes about ${fmt(fd.compost_lb_yr)} lb a year${fd.compost_share_pct != null ? `, ${r0(fd.compost_share_pct)}% of what the beds need` : ""}.` : "A compost bin would turn kitchen scraps into bed food."),
    formula: "Crops: yield per 10 ft of row × the row length each plant fills. Fruit: yield per plant once old enough. Compost = people × scraps per week × 52 × yield.",
    coefs: coefRefs("kitchen_scraps_lb_person_wk", "compost_yield", "compost_lb_per_ft3", "bed_compost_in_yr"),
  });

  const sub: Partial<Record<ScoreId, number | null>> = Object.fromEntries(metrics.filter((m) => m.id !== "food").map((m) => [m.id, m.score]));
  const score = ecoScore(sub);
  return {
    score, grade: gradeFor(score), metrics, balcony, has_house: !!house, years_ahead: ahead,
    water: { design_gal: design, baseline_gal: baseline, saved_gal: Math.max(0, baseline - design), rain_share_pct: rainShare },
    barrel, storm, bay, carbon: co2, shade, pollinators: pol, food: fd,
  };
}

// ---------------------------------------------------------------- typical lawn yard

/** The same yard as all lawn: same zones' area plus kept and converted lawn, no plants, same house and paving. */
export function lawnYard(x: EcoInput): EcoReport {
  const area = x.garden.zones.reduce((s, z) => s + polygonArea(z.polygon), 0) + x.eco.lawn_sqft + x.eco.converted_lawn_sqft;
  return ecoReport({
    ...x,
    garden: { ...x.garden, zones: [], placements: [] },
    eco: { ...x.eco, lawn_sqft: area, converted_lawn_sqft: 0, barrel_gal: 0, rain_garden_sqft: 0, compost_bin: false },
  });
}

// ---------------------------------------------------------------- greener swaps

const hue = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const FEED = { low: 0, normal: 1, heavy: 2 } as const;

/** Apply a swap to the garden and eco layer (pure). */
export function applySwap(g: GardenDoc, eco: EcoLayer, a: SwapAction): { garden: GardenDoc; eco: EcoLayer } {
  switch (a.type) {
    case "replace_plant":
      return { garden: { ...g, placements: g.placements.map((p) => (p.plant_id === a.from ? { ...p, plant_id: a.to } : p)) }, eco };
    case "convert_lawn":
      return { garden: g, eco: { ...eco, lawn_sqft: Math.max(0, eco.lawn_sqft - a.sqft), converted_lawn_sqft: eco.converted_lawn_sqft + Math.min(a.sqft, eco.lawn_sqft) } };
    case "barrel":
      return { garden: g, eco: { ...eco, barrel_gal: a.gal } };
    case "rain_garden":
      return { garden: g, eco: { ...eco, rain_garden_sqft: a.sqft } };
    case "move":
      return { garden: { ...g, placements: g.placements.map((p) => (p.id === a.placement_id ? { ...p, x_ft: a.x_ft, y_ft: a.y_ft } : p)) }, eco };
    case "add_plant": {
      const added = a.spots.map((s, i) => ({ id: `new_${a.plant_id}_${i}`, plant_id: a.plant_id, x_ft: s.x_ft, y_ft: s.y_ft, zone_id: s.zone_id, planted_on: g.planted_on, group_id: null } as PlacementInput & { id: string }));
      return { garden: { ...g, placements: [...g.placements, ...added] }, eco };
    }
  }
}

/** Up to 3 swaps that raise the Eco score, best first. Never suggests invasive plants; respects theme, light and zone. */
export function greenerSwaps(x: EcoInput, base: EcoReport = ecoReport(x)): Swap[] {
  const { garden: g, eco } = x;
  const byId = new Map(x.plants.map((p) => [p.id, p]));
  const placed = placedOf(g, byId, x.today);
  const zone = g.starter.hardiness_zone ?? zoneForLat(g.site.lat);
  const ctx: SuggestCtx = { site: g.site, zone, themes: g.starter.themes ?? [], prefer_natives: g.starter.prefer_natives ?? "off", today: x.today };
  const ok = (p: Plant) => !isBlocked(p) && !hardFilter({ ...p, edible: undefined }, ctx) && p.light.includes(g.site.sun);
  const cands: Omit<Swap, "delta">[] = [];

  // Plant swaps: same group, similar color and size, lower Kc or lower feeding.
  const seen = new Set<string>();
  for (const pp of placed) {
    const p = pp.plant;
    if (seen.has(p.id) || p.edible) continue;
    seen.add(p.id);
    const h0 = p.flower_colors[0] ? hue(p.flower_colors[0].hex) : null;
    const size = mean(p.mature_spread_ft);
    const alt = x.plants
      .filter((q) => q.id !== p.id && groupOf(q) === groupOf(p) && q.category === p.category && ok(q) && !q.edible)
      // Keep what the plant does for wildlife: a butterfly plant is only swapped for another butterfly plant.
      .filter((q) => p.wildlife_value.every((w) => q.wildlife_value.includes(w)) && (!p.host_plant_for.length || q.host_plant_for.length > 0))
      .filter((q) => q.kc <= p.kc - 0.1 || FEED[q.feeding ?? "normal"] < FEED[p.feeding ?? "normal"])
      .filter((q) => { const s = mean(q.mature_spread_ft); return s >= size * 0.5 && s <= size * 2; })
      .filter((q) => h0 == null || (q.flower_colors[0] && hueDist(hue(q.flower_colors[0].hex), h0) <= 30))
      .sort((a, b) => a.kc - b.kc)[0];
    if (alt) {
      const n = placed.filter((z) => z.plant.id === p.id).length;
      cands.push({ id: `swap:${p.id}:${alt.id}`, title: `Swap ${p.common_name.toLowerCase()} for ${alt.common_name.toLowerCase()}`, detail: `Similar ${alt.flower_colors[0]?.name ?? "look"} and size, ${alt.kc < p.kc ? "less water" : "less fertilizer"}. Changes ${n} plant${n > 1 ? "s" : ""}.`, action: { type: "replace_plant", from: p.id, to: alt.id } });
    }
  }
  if (!base.balcony && eco.lawn_sqft >= 100) {
    const sqft = Math.min(eco.lawn_sqft, Math.max(100, Math.round((eco.lawn_sqft * 0.6) / 50) * 50));
    cands.push({ id: "lawn", title: `Turn ${sqft} sq ft of lawn into a pollinator bed`, detail: "Less mowing, watering and fertilizer, more butterflies.", action: { type: "convert_lawn", sqft } });
  }
  if (base.barrel && eco.barrel_gal === 0) {
    const used = ecoReport({ ...x, eco: { ...eco, barrel_gal: base.barrel.suggested_gal } }).barrel?.used_gal ?? 0;
    cands.push({ id: "barrel", title: `Add ${barrelLabel(base.barrel.suggested_gal)}`, detail: `Your roof could water the beds with about ${fmt(used)} gal of rain a year instead of tap water.`, action: { type: "barrel", gal: base.barrel.suggested_gal } });
  }
  if (base.storm && eco.rain_garden_sqft === 0 && base.storm.suggested_rg_sqft > 0) {
    cands.push({ id: "rain_garden", title: `Add a ${base.storm.suggested_rg_sqft} sq ft rain garden`, detail: "A shallow planted dip that soaks up roof and driveway runoff before it reaches the bay.", action: { type: "rain_garden", sqft: base.storm.suggested_rg_sqft } });
  }
  if (base.shade && eco.house) {
    const hs = eco.house;
    for (const pp of placed.filter((p) => p.plant.woody && mean(p.plant.mature_height_ft) >= 15)) {
      const r = mean(pp.plant.mature_spread_ft) / 2;
      const spots = [{ x_ft: hs.x - r - 4, y_ft: hs.y + hs.h / 2, side: "west" }, { x_ft: hs.x + hs.w / 2, y_ft: hs.y + hs.h + r + 4, side: "south" }]
        .filter((s) => s.x_ft >= 0 && s.x_ft <= g.canvas_w_ft && s.y_ft >= 0 && s.y_ft <= g.canvas_h_ft);
      for (const s of spots) cands.push({ id: `move:${pp.id}:${s.side}`, title: `Move the ${pp.plant.common_name.toLowerCase()} to the ${s.side} side of the house`, detail: "Afternoon shade on the hot walls keeps the house cooler in summer.", action: { type: "move", placement_id: pp.id, x_ft: Math.round(s.x_ft * 10) / 10, y_ft: Math.round(s.y_ft * 10) / 10 } });
    }
  }
  if (base.pollinators.nectar >= 2 && base.pollinators.host === 0) {
    const host = ["asclepias_tuberosa", "passiflora_incarnata", "asclepias_incarnata"].map((id) => byId.get(id)).find((p): p is Plant => !!p && ok(p));
    const z = g.zones.filter((zz) => zz.kind !== "edible").sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0];
    if (host && z) {
      const xs = z.polygon.map((pt) => pt[0]), ys = z.polygon.map((pt) => pt[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      cands.push({ id: `host:${host.id}`, title: `Add ${host.common_name.toLowerCase()} for caterpillars`, detail: `Host plant for ${host.host_plant_for[0] ?? "butterflies"}: completes the butterfly life cycle.`, action: { type: "add_plant", plant_id: host.id, spots: [-1.5, 0, 1.5].map((dx) => ({ x_ft: Math.round((cx + dx) * 10) / 10, y_ft: Math.round(cy * 10) / 10, zone_id: z.id })) } });
    }
  }

  const scored = cands.map((c) => {
    const next = applySwap(g, eco, c.action);
    return { ...c, delta: ecoReport({ ...x, garden: next.garden, eco: next.eco }).score - base.score };
  }).filter((c) => c.delta > 0);
  scored.sort((a, b) => b.delta - a.delta);
  // One swap per kind of plant replacement target, at most 3 overall.
  const out: Swap[] = [];
  for (const s of scored) {
    if (out.length >= 3) break;
    if (s.action.type === "move" && out.some((o) => o.action.type === "move")) continue;
    out.push(s);
  }
  return out;
}

export type { CoefKey };
