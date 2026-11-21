/**
 * Garden Starter plan generator (Phase 11). From the starter answers and the site, builds a first layout:
 *   - a landscape zone with native picks (theme from goals; fewer species for less time; low-care = low water)
 *   - if "food" was chosen, an edible zone (a 4 ft wide raised-bed rectangle, or an in-ground bed per the soil plan)
 *     filled with 2 to 3 crops that can be planted soon, plus 2 to 3 native wildflowers next to it for pollinators.
 * Pure: the /start page calls it, then saves the result through POST /api/gardens.
 */
import type { Plant, PlacementInput, SiteInput, StarterAnswers, Theme, ZoneInput } from "../types";
import { nextPlantingDate } from "./edibles";
import { addDays } from "./geo";
import { recommend } from "./recommend";
import { edibleSoilPlan } from "./soilplan";
import { fillBed } from "./spacing";

export interface StarterPlan {
  name: string;
  theme: Theme | null;
  canvas_w_ft: number;
  canvas_h_ft: number;
  zones: (ZoneInput & { id: string })[];
  /** planted_on is set for crops (the planned planting date); natives default to the save date. */
  placements: (Omit<PlacementInput, "planted_on"> & { planted_on?: string })[];
  crops: string[];
  pollinators: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const POLLINATOR = ["butterflies", "bees"];
export const RAISED_DEPTH_IN = 10;
export const BED_W_FT = 4;

export function themeFor(a: Pick<StarterAnswers, "goals">): Theme | null {
  return a.goals.includes("butterflies") || a.goals.includes("flowers") ? "wildlife" : null;
}

/** Canvas in feet from yard area, roughly 8:5 (same rule as the design studio). */
export function starterCanvas(areaSqft: number) {
  const w = clamp(Math.round(Math.sqrt((areaSqft * 8) / 5)), 16, 80);
  return { w, h: Math.round((w * 5) / 8) };
}

/** Native picks: theme fit, max 2 per category, fewer species for less time, low water for low-care. */
export function nativePicks(site: SiteInput, plants: Plant[], a: StarterAnswers): { plant: Plant; count: number }[] {
  const theme = themeFor(a);
  const maxSpecies = a.hours_week === "1" ? 4 : a.hours_week === "5+" ? 7 : 6;
  const picks: { plant: Plant; count: number }[] = [];
  const perCat: Record<string, number> = {};
  for (const x of recommend(site, plants, theme).natives) {
    const p = x.plant;
    if (theme && !p.garden_themes.includes(theme)) continue;
    if (a.goals.includes("low_care") && p.water_need !== "low") continue;
    if (x.terms.space < 0.7 || ["large_tree", "palm"].includes(p.category)) continue;
    if ((perCat[p.category] ?? 0) >= 2) continue;
    perCat[p.category] = (perCat[p.category] ?? 0) + 1;
    const spread = (p.mature_spread_ft[0] + p.mature_spread_ft[1]) / 2;
    picks.push({ plant: p, count: spread < 2 ? 3 : spread < 5 ? 2 : 1 });
    if (picks.length >= maxSpecies) break;
  }
  return picks;
}

/**
 * 2 or 3 crops that fit the site (light term ≥ minLight: 1 = thrives; balconies pass 0.5, "tolerates", and put the
 * pots at the railing for the most sun) and can be planted within ~4 months; tomato first when it fits (the demo story). */
export function cropPicks(site: SiteInput, plants: Plant[], today: string, max = 3, containerOnly = false, minLight = 1): Plant[] {
  const soon = addDays(today, 14);
  const limit = addDays(today, 130);
  const ok = recommend(site, plants, null).edibles
    // Compact crops only: a 4 ft bed (or a pot) has no room for sprawlers like sweet potato.
    .filter((s) => s.terms.light >= minLight && s.plant.mature_spread_ft[1] <= 3 && (!containerOnly || s.plant.container_ok))
    .filter((s) => {
      const d = nextPlantingDate(s.plant.edible?.planting_windows[site.region] ?? [], soon);
      return !!d && d <= limit;
    })
    .map((s) => s.plant);
  const first = ok.find((p) => p.id === (containerOnly ? "cherry_tomato" : "tomato"));
  const rest = ok.filter((p) => p !== first && (p.id !== "tomato" && p.id !== "cherry_tomato"));
  // A mix: the tomato, then an herb, then another vegetable.
  const herb = rest.find((p) => p.category === "herb");
  const veg = rest.find((p) => p.category === "vegetable");
  return [first, herb, veg, ...rest].filter((p, i, arr): p is Plant => !!p && arr.indexOf(p) === i).slice(0, max);
}

/** Native wildflowers that feed pollinators, for the strip next to the edible bed. */
export function pollinatorPicks(site: SiteInput, plants: Plant[], n = 3): Plant[] {
  // Scores often tie at 1 (the theme bonus caps them); then prefer plants that thrive in this light (not just
  // tolerate it), longer bloom, and a smaller pot.
  return recommend(site, plants, "wildlife").natives
    .filter(({ plant: p }) => p.category === "wildflower" && p.wildlife_value.some((w) => POLLINATOR.includes(w)) && p.mature_spread_ft[1] <= 3)
    .sort((a, b) => b.score - a.score || b.terms.light - a.terms.light || b.plant.bloom_months.length - a.plant.bloom_months.length
      || (a.plant.min_container_gal ?? 99) - (b.plant.min_container_gal ?? 99))
    .slice(0, n)
    .map((s) => s.plant);
}

/** Tiered rows inside [x0, x0+w] × [0, h]: big plants at the back (top), wildflowers up front. */
function rows(items: { plant: Plant; count: number }[], x0: number, w: number, h: number) {
  const TIER: Record<string, number> = { small_tree: 0, vine: 0, shrub: 1, fern: 1, grass: 2, wildflower: 2, aquatic: 2 };
  const tiers = new Map<number, Plant[]>();
  for (const { plant, count } of items) {
    const t = TIER[plant.category] ?? 1;
    tiers.set(t, [...(tiers.get(t) ?? []), ...Array<Plant>(count).fill(plant)]);
  }
  const used = [...tiers.keys()].sort();
  return used.flatMap((t, row) => {
    const list = tiers.get(t)!;
    const y = ((row + 0.5) / used.length) * h;
    const step = w / list.length;
    return list.map((p, i) => ({ plant_id: p.id, x_ft: r1(clamp(x0 + step * (i + 0.5), x0 + 0.8, x0 + w - 0.8)), y_ft: r1(clamp(y + (list.length > 3 ? (i % 2 ? 0.8 : -0.8) : 0), 1, h - 1)) }));
  });
}

export function starterPlan(a: StarterAnswers, site: SiteInput, plants: Plant[], today: string): StarterPlan {
  const { w, h } = starterCanvas(site.area_sqft);
  const theme = themeFor(a);
  const food = a.goals.includes("food");
  const natives = nativePicks(site, plants, a);
  const zones: StarterPlan["zones"] = [];
  const placements: StarterPlan["placements"] = [];
  let crops: Plant[] = [];
  let pollinators: Plant[] = [];

  if (!food) {
    const split = r1((w * 2) / 3);
    zones.push({ id: "z_bed", name: "Native bed", irrigation: "drip", kind: "landscape", polygon: [[0.5, 0.5], [split - 0.5, 0.5], [split - 0.5, h - 0.5], [0.5, h - 0.5]] });
    zones.push({ id: "z_border", name: "Native border", irrigation: "spray", kind: "landscape", polygon: [[split + 0.5, 0.5], [w - 0.5, 0.5], [w - 0.5, h - 0.5], [split + 0.5, h - 0.5]] });
    for (const p of rows(natives, 0, w, h)) placements.push({ ...p, zone_id: p.x_ft < split ? "z_bed" : "z_border" });
  } else {
    const soil = edibleSoilPlan(site, { containers: a.space === "containers" });
    const bedLen = clamp(h - 5, 4, 12);
    const bx0 = w - 1 - BED_W_FT;
    const bed = { x: bx0, y: 1, w: BED_W_FT, h: bedLen };
    const landW = bx0 - 1.5;
    zones.push({
      id: "z_native", name: "Native landscape", irrigation: "drip", kind: "landscape",
      polygon: [[0.5, 0.5], [landW, 0.5], [landW, bed.y + bedLen + 0.5], [w - 0.5, bed.y + bedLen + 0.5], [w - 0.5, h - 0.5], [0.5, h - 0.5]],
    });
    zones.push({
      id: "z_edible", name: soil.bed === "raised" ? "Raised vegetable bed" : soil.bed === "container" ? "Vegetable pots" : "Vegetable bed",
      irrigation: "drip", kind: "edible", bed: soil.bed, depth_in: soil.bed === "raised" ? RAISED_DEPTH_IN : null,
      polygon: [[bed.x, bed.y], [bed.x + bed.w, bed.y], [bed.x + bed.w, bed.y + bed.h], [bed.x, bed.y + bed.h]],
    });
    for (const p of rows(natives, 0, landW, h)) placements.push({ ...p, zone_id: "z_native" });

    // Crops: split the bed lengthwise, one segment per crop, offset grid at each crop's spacing.
    crops = cropPicks(site, plants, today);
    const seg = bedLen / Math.max(1, crops.length);
    crops.forEach((c, i) => {
      const plantOn = nextPlantingDate(c.edible?.planting_windows[site.region] ?? [], addDays(today, 14)) ?? undefined;
      const pts = fillBed({ x: bed.x, y: bed.y + i * seg, w: bed.w, h: seg }, c.spacing_ft, c.id.includes("tomato") ? 3 : 4);
      for (const pt of pts) placements.push({ plant_id: c.id, x_ft: pt.x_ft, y_ft: pt.y_ft, zone_id: "z_edible", group_id: `crop_${c.id}`, planted_on: plantOn });
    });

    // Pollinator strip just below the bed.
    pollinators = pollinatorPicks(site, plants, 3).filter((p) => !natives.some((n) => n.plant.id === p.id)).slice(0, 3);
    if (pollinators.length < 2) pollinators = pollinatorPicks(site, plants, 3).slice(0, 3);
    const sy = clamp(bed.y + bedLen + 1.8, 1, h - 1);
    pollinators.forEach((p, i) => {
      placements.push({ plant_id: p.id, x_ft: r1(bed.x + ((i + 0.5) * bed.w) / pollinators.length), y_ft: r1(sy), zone_id: "z_native", group_id: "pollinator_strip" });
    });
  }

  return {
    name: food ? "My native and food garden" : "My native garden", theme, canvas_w_ft: w, canvas_h_ft: h, zones, placements,
    crops: crops.map((c) => c.id), pollinators: pollinators.map((p) => p.id),
  };
}
