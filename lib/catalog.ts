/**
 * Phase 11.6 catalog normalization. Every plant gets
 *   group       vegetable | herb | fruit | flower | shrub_tree   (user-facing group; natives can be any group)
 *   native      boolean (separate from group: muscadine grape is a native fruit)
 *   life_cycle  annual | perennial | biennial
 *   feeding     low | normal | heavy
 *   zones       USDA hardiness zones it survives (perennials: from cold_hardy_f; annuals: every Florida zone)
 *   woody, tolerates_wet_feet   (Phase 11.7 eco engines)
 * Explicit values in the data always win; the rest are derived here and stored at seed time. Pure, used by the seed,
 * the tests and the engines (so records loaded straight from JSON behave the same as DB rows).
 */
import { FL_ZONES, zoneMinF } from "./engine/zone";
import type { Plant, PlantGroup } from "./types";

const WOODY = new Set(["palm", "large_tree", "small_tree", "shrub"]);
const FRUIT_IDS = new Set(["strawberry"]);

export function groupOf(p: Pick<Plant, "id" | "category" | "origin"> & { group?: PlantGroup }): PlantGroup {
  if (p.group) return p.group;
  if (FRUIT_IDS.has(p.id)) return "fruit";
  if (p.category === "vegetable") return "vegetable";
  if (p.category === "herb") return "herb";
  if (["wildflower", "vine", "aquatic"].includes(p.category)) return "flower";
  return "shrub_tree";
}

export const isNative = (p: Pick<Plant, "origin"> & { native?: boolean }) => p.native ?? p.origin === "native";
export const isEdible = (p: Plant) => !!p.edible || groupOf(p) === "fruit" || groupOf(p) === "vegetable" || groupOf(p) === "herb";
export const isBlocked = (p: Pick<Plant, "invasive_status"> & { invasive_category?: string | null }) =>
  p.invasive_status === "invasive" || p.invasive_category === "I" || p.invasive_category === "II";

export function lifeCycleOf(p: Plant): NonNullable<Plant["life_cycle"]> {
  if (p.life_cycle) return p.life_cycle;
  if (p.category === "vegetable") return "annual";
  return "perennial";
}

const HEAVY = new Set(["tomato", "cherry_tomato", "bell_pepper", "eggplant", "sweet_potato"]);
export function feedingOf(p: Plant): NonNullable<Plant["feeding"]> {
  if (p.feeding) return p.feeding;
  if (HEAVY.has(p.id)) return "heavy";
  if (p.origin === "native") return "low";
  if (p.origin === "edible") return "normal";
  return p.water_need === "low" ? "low" : "normal";
}

/** Zones a perennial survives: the zone's average extreme minimum is no more than 5°F below the plant's limit. */
export function zonesOf(p: Plant): string[] {
  if (p.zones?.length) return p.zones;
  if (lifeCycleOf(p) === "annual") return [...FL_ZONES];
  return FL_ZONES.filter((z) => zoneMinF(z) + 5 >= p.cold_hardy_f);
}

const DEFAULTS: Partial<Plant> = {
  invasive_status: "none", native_alternatives: [], salt_tolerance: "low", wind_tolerance: "medium", root_depth_in: 12, kc: 0.7,
  growth_rate: "medium", flower_colors: [], fruit_colors: [], foliage_color: "#4E7A3E", bloom_months: [], fruit_months: [],
  bloom_trigger: "season", gdd_base_f: 50, bloom_gdd: null, years_to_first_bloom: 0, bud_to_bloom_days: [7, 14], bloom_to_fruit_days: [30, 60],
  dioecious: false, wildlife_value: [], host_plant_for: [], garden_themes: [], common_issues: [], establishment_months: 6,
  habitat: null, landscape_use: null, ph_range: [5.5, 7], verified: false, source_urls: [],
};

/** Fill defaults and derived Florida fields. Idempotent. */
export function normalizePlant(raw: Partial<Plant> & Pick<Plant, "id" | "common_name" | "scientific_name" | "origin" | "category" | "form">): Plant {
  const p = { ...DEFAULTS, ...raw } as Plant;
  if (p.planting_height_ft == null) p.planting_height_ft = Math.max(0.3, p.mature_height_ft[0] / 4);
  if (p.spacing_ft == null) p.spacing_ft = (p.mature_spread_ft[0] + p.mature_spread_ft[1]) / 2;
  if (p.edible?.source_url && !p.source_urls.length) p.source_urls = [p.edible.source_url];
  const out: Plant = {
    ...p,
    group: groupOf(p),
    native: isNative(p),
    life_cycle: lifeCycleOf(p),
    feeding: feedingOf(p),
    woody: p.woody ?? WOODY.has(p.category),
    tolerates_wet_feet: p.tolerates_wet_feet ?? (p.category === "aquatic" || p.id === "taxodium_distichum" || p.id === "iris_virginica" || p.id === "asclepias_incarnata"),
    heat_humidity_ok: p.heat_humidity_ok ?? true,
  };
  out.zones = zonesOf(out);
  return out;
}

const SEASONS: [string, number[]][] = [["winter", [12, 1, 2]], ["spring", [3, 4, 5]], ["summer", [6, 7, 8]], ["fall", [9, 10, 11]]];
/** "spring to fall", "all year", "winter" from bloom or fruit months. */
export function seasonSpan(months: number[]): string {
  if (!months.length) return "";
  if (months.length >= 11) return "all year";
  const hit = SEASONS.filter(([, ms]) => ms.some((m) => months.includes(m))).map(([s]) => s);
  if (hit.length === 1) return hit[0];
  if (hit.length === 4) return "most of the year";
  // Order from the first bloom month so "fall to winter" reads naturally.
  const start = SEASONS.findIndex(([, ms]) => ms.includes(months[0]));
  const ordered = [...SEASONS.slice(start), ...SEASONS.slice(0, start)].map(([s]) => s).filter((s) => hit.includes(s));
  return `${ordered[0]} to ${ordered.at(-1)}`;
}

/** One friendly line for a plant card ("Blooms spring to fall, butterflies love it"). Rule text; Gemini may polish it. */
export function friendlyLine(p: Plant): string {
  const g = groupOf(p);
  const extras: string[] = [];
  if (p.host_plant_for.length) extras.push(`${p.host_plant_for[0]} caterpillars feed on it`);
  else if (p.wildlife_value.includes("butterflies")) extras.push("butterflies love it");
  else if (p.wildlife_value.includes("hummingbirds")) extras.push("hummingbirds love it");
  if (p.water_need === "low" && !p.edible) extras.push("needs little water");
  const tail = extras.length ? `, ${extras.slice(0, 2).join(" and ")}` : "";
  if (p.edible) {
    const weeks = Math.round(p.edible.days_to_harvest[0] / 7);
    return `Ready to pick in about ${weeks < 9 ? `${weeks} weeks` : `${Math.round(weeks / 4.3)} months`}${tail}.`;
  }
  if (g === "fruit") {
    const yrs = p.years_to_first_fruit ?? 2;
    return `Fruit in ${seasonSpan(p.fruit_months) || "season"}, first crop in about ${yrs} year${yrs > 1 ? "s" : ""}${tail}.`;
  }
  if (p.bloom_months.length && p.flower_colors.length) {
    const c = p.flower_colors[0].name;
    return `${c.charAt(0).toUpperCase() + c.slice(1)} blooms ${seasonSpan(p.bloom_months)}${tail}.`;
  }
  return `${p.woody ? "Evergreen structure" : "Easy foliage"} for your garden${tail}.`;
}
