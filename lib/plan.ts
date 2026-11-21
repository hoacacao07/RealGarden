/**
 * Inputs for the plan page (Phase 11): soil plan per zone kind, shopping list inputs and the crops for the calendar.
 * Pure given a garden and the plant catalog, so it runs on the server and the client recomputes with user edits.
 */
import { polygonArea } from "./engine/geo";
import type { BedDims, ShoppingInput, ShopLine } from "./engine/shopping";
import { balconyShopping } from "./engine/balcony";
import { edibleSoilPlan, soilPlan, type SoilPlan } from "./engine/soilplan";
import type { GardenDoc, Plant, ZoneKind } from "./types";

export const DEFAULT_RAISED_DEPTH_IN = 10;

export interface PlanInputs {
  soil: SoilPlan[];
  shopping: Omit<ShoppingInput, "bagFt3" | "mix">;
  crops: { plant: Plant; count: number; planted_on: string | null }[];
}

function bbox(poly: [number, number][]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const r1 = (v: number) => Math.round(v * 10) / 10;

export function planInputs(g: GardenDoc, plants: Plant[]): PlanInputs & { balconyLines: ShopLine[] } {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const placed = g.placements.map((p) => byId.get(p.plant_id)).filter((p): p is Plant => !!p);
  const crops = cropGroups(g, byId);

  // Balcony mode: every plant is in a pot of potting mix; containers, mix, saucers etc. come from balconyShopping.
  if (g.site.kind === "balcony") {
    const pot = edibleSoilPlan(g.site, { containers: true });
    return {
      soil: [{ ...pot, title: "Fill every pot with potting mix", reasons: ["Garden soil packs down in pots and drains poorly", "Natives and edibles alike: bagged potting mix, pots with drainage holes"] }],
      shopping: { placed, landscapeAreaSqft: 0, raisedBeds: [], inGroundEdibleAreaSqft: 0, hasEdibles: false },
      crops, balconyLines: balconyShopping(g.placements, byId, g.site.rules),
    };
  }
  const kinds = [...new Set(g.zones.map((z) => z.kind ?? "landscape"))] as ZoneKind[];
  const hasEdibles = placed.some((p) => p.origin === "edible");
  if (hasEdibles && !kinds.includes("edible")) kinds.push("edible");
  const soil = soilPlan(g.site, kinds, g.starter.space);
  const edibleDecision = soil.find((s) => s.zone_kind === "edible");

  const raisedBeds: BedDims[] = [];
  let inGround = 0;
  let landscape = 0;
  for (const z of g.zones) {
    const area = polygonArea(z.polygon);
    if ((z.kind ?? "landscape") === "landscape") { landscape += area; continue; }
    const bed = z.bed ?? edibleDecision?.bed ?? "in_ground";
    if (bed === "raised") {
      const b = bbox(z.polygon);
      raisedBeds.push({ l_ft: r1(Math.max(b.w, b.h)), w_ft: r1(Math.min(b.w, b.h)), depth_in: z.depth_in ?? DEFAULT_RAISED_DEPTH_IN });
    } else if (bed === "in_ground") inGround += area;
  }

  return {
    soil,
    shopping: { placed, landscapeAreaSqft: landscape, raisedBeds, inGroundEdibleAreaSqft: inGround, hasEdibles },
    crops, balconyLines: [],
  };
}

/** Crops for the calendar: one entry per edible species, with the newest planting date. */
function cropGroups(g: GardenDoc, byId: Map<string, Plant>) {
  const groups = new Map<string, { plant: Plant; count: number; planted_on: string | null }>();
  for (const pl of g.placements) {
    const p = byId.get(pl.plant_id);
    if (!p?.edible) continue;
    const cur = groups.get(p.id);
    if (!cur) groups.set(p.id, { plant: p, count: 1, planted_on: pl.planted_on });
    else groups.set(p.id, { ...cur, count: cur.count + 1, planted_on: cur.planted_on && cur.planted_on > pl.planted_on ? cur.planted_on : pl.planted_on });
  }

  return [...groups.values()];
}
