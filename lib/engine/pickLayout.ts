/**
 * First layout from suggestion picks (Phase 11.6 / 11.8 style-first starter). Pure.
 *   Yard: one planting bed with tiered rows (trees and big shrubs at the back, flowers up front) plus, when the picks
 *         include vegetables or herbs, an edible bed on the right (raised or in-ground per the soil plan) split into
 *         one strip per crop; crops are dated to their next planting date.
 *   Balcony: pots in rows along the railing (sunniest strip), each at the plant's minimum pot size.
 */
import { groupOf } from "../catalog";
import type { Plant, PlacementInput, SiteInput, Theme } from "../types";
import { balconyZone } from "./balcony";
import { potDiameterIn } from "./containerWater";
import { nextPlantingDate } from "./edibles";
import { edibleSoilPlan } from "./soilplan";
import { fillBed } from "./spacing";
import { BED_W_FT, RAISED_DEPTH_IN, rows, starterCanvas, type StarterPlan } from "./starter";
import type { PlantPick } from "./suggest";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

const isCrop = (p: Plant) => !!p.edible && (groupOf(p) === "vegetable" || groupOf(p) === "herb" || p.id === "strawberry");

export function planFromPicks(picks: PlantPick[], plants: Plant[], site: SiteInput, today: string, opts: { name?: string; theme?: Theme | null } = {}): StarterPlan {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const items = picks.map((k) => ({ plant: byId.get(k.plant_id)!, count: Math.max(1, Math.round(k.qty)) })).filter((x) => x.plant);
  const plantOn = (p: Plant) => (p.edible ? nextPlantingDate(p.edible.planting_windows[site.region] ?? [], today) ?? undefined : undefined);

  if (site.kind === "balcony") {
    const L = site.balcony_l_ft ?? 10;
    const W = site.balcony_w_ft ?? 5;
    const placements: StarterPlan["placements"] = [];
    let x = 0.3;
    let row = 0;
    for (const { plant, count } of items) {
      for (let i = 0; i < count; i++) {
        const gal = plant.min_container_gal ?? 3;
        const d = potDiameterIn(gal) / 12;
        if (x + d > L - 0.2) { x = 0.3; row++; }
        const y = 0.3 + d / 2 + row * 1.6;
        if (y > W - 0.2) break;
        placements.push({
          plant_id: plant.id, x_ft: r1(x + d / 2), y_ft: r1(Math.min(W - d / 2, y)), zone_id: "z_balcony", container_gal: gal, mount: "floor",
          planted_on: plantOn(plant), group_id: isCrop(plant) ? `crop_${plant.id}` : "pots",
        });
        x += d + 0.4;
      }
    }
    return {
      name: opts.name ?? "My balcony garden", theme: opts.theme ?? null, canvas_w_ft: L, canvas_h_ft: W, zones: [balconyZone(L, W)], placements,
      crops: items.filter((i) => isCrop(i.plant)).map((i) => i.plant.id), pollinators: items.filter((i) => i.plant.wildlife_value.includes("butterflies")).map((i) => i.plant.id),
    };
  }

  const { w, h } = starterCanvas(site.area_sqft);
  const crops = items.filter((i) => isCrop(i.plant));
  const land = items.filter((i) => !isCrop(i.plant));
  const zones: StarterPlan["zones"] = [];
  const placements: StarterPlan["placements"] = [];

  if (!crops.length) {
    zones.push({ id: "z_bed", name: "Garden bed", irrigation: "drip", kind: "landscape", polygon: [[0.5, 0.5], [w - 0.5, 0.5], [w - 0.5, h - 0.5], [0.5, h - 0.5]] });
    for (const p of rows(land, 0, w, h)) placements.push({ ...p, zone_id: "z_bed" });
  } else {
    const soil = edibleSoilPlan(site, { containers: false });
    const bedLen = clamp(h - 2, 4, 12);
    const bx0 = land.length ? w - 1 - BED_W_FT : 1;
    const bedW = land.length ? BED_W_FT : Math.min(w - 2, BED_W_FT * 2);
    const bed = { x: bx0, y: 1, w: bedW, h: bedLen };
    if (land.length) {
      const landW = bx0 - 1.5;
      zones.push({ id: "z_bed", name: "Garden bed", irrigation: "drip", kind: "landscape", polygon: [[0.5, 0.5], [landW, 0.5], [landW, h - 0.5], [0.5, h - 0.5]] });
      for (const p of rows(land, 0, landW, h)) placements.push({ ...p, zone_id: "z_bed" });
    }
    zones.push({
      id: "z_edible", name: soil.bed === "raised" ? "Raised vegetable bed" : "Vegetable bed", irrigation: "drip", kind: "edible", bed: soil.bed,
      depth_in: soil.bed === "raised" ? RAISED_DEPTH_IN : null,
      polygon: [[bed.x, bed.y], [bed.x + bed.w, bed.y], [bed.x + bed.w, bed.y + bed.h], [bed.x, bed.y + bed.h]],
    });
    const seg = bedLen / crops.length;
    crops.forEach(({ plant, count }, i) => {
      const pts = fillBed({ x: bed.x, y: bed.y + i * seg, w: bed.w, h: seg }, Math.max(0.5, plant.spacing_ft), count);
      const spots = pts.length ? pts : [{ x_ft: r1(bed.x + bed.w / 2), y_ft: r1(bed.y + (i + 0.5) * seg) }];
      for (const pt of spots) placements.push({ plant_id: plant.id, x_ft: pt.x_ft, y_ft: pt.y_ft, zone_id: "z_edible", group_id: `crop_${plant.id}`, planted_on: plantOn(plant) });
    });
  }
  return {
    name: opts.name ?? (crops.length ? "My garden" : "My flower garden"), theme: opts.theme ?? null, canvas_w_ft: w, canvas_h_ft: h, zones,
    placements: placements as (Omit<PlacementInput, "planted_on"> & { planted_on?: string })[],
    crops: crops.map((c) => c.plant.id), pollinators: land.filter((i) => i.plant.wildlife_value.includes("butterflies")).map((i) => i.plant.id),
  };
}
