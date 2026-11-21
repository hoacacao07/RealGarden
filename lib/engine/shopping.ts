/**
 * Shopping list (Phase 11). Quantities only; prices are optional user-entered unit prices (never invented).
 *   Raised bed fill   V_ft3 = L · W · D_in / 12, cubic yards = V / 27, bags = ceil(V / bag_ft3) (default 1.5 ft³)
 *   1:1:1 mix option  one third each of compost, peat moss and vermiculite
 *   Compost           in-ground edible beds: area · depth (default 2 in)
 *   Mulch             landscape area · 3 in
 *   Fertilizer        edibles only: balanced slow-release, "follow the product label and UF/IFAS guidance"
 */
import type { Plant } from "../types";

export type LineCategory = "plants" | "soil" | "compost" | "mulch" | "fertilizer" | "materials" | "containers" | "supplies";

export interface ShopLine {
  id: string;
  category: LineCategory;
  item: string;
  qty: number;
  unit: string;
  note?: string;
  optional?: boolean;
  /** Bagged material: the volume, so the list can recount bags when the bag size changes. */
  volume_ft3?: number;
}

export interface BedDims { l_ft: number; w_ft: number; depth_in: number }

export const DEFAULT_BAG_FT3 = 1.5;
export const MULCH_DEPTH_IN = 3;
export const COMPOST_DEPTH_IN = 2;
export const FERTILIZER_NOTE = "Balanced slow-release, mixed into the top 6 in at planting. Follow the product label and UF/IFAS guidance.";

const r2 = (v: number) => Math.round(v * 100) / 100;

export function bedVolumeFt3(b: BedDims): number {
  return (b.l_ft * b.w_ft * b.depth_in) / 12;
}
export const ft3ToYd3 = (v: number) => v / 27;
export function bagsFor(volumeFt3: number, bagFt3 = DEFAULT_BAG_FT3): number {
  if (volumeFt3 <= 0) return 0;
  return Math.ceil(volumeFt3 / bagFt3 - 1e-9);
}
/** Volume of an even layer over an area (sq ft · in → ft³). */
export const layerFt3 = (areaSqft: number, depthIn: number) => (areaSqft * depthIn) / 12;

export function plantLines(placed: Plant[]): ShopLine[] {
  const counts = new Map<string, { p: Plant; n: number }>();
  for (const p of placed) counts.set(p.id, { p, n: (counts.get(p.id)?.n ?? 0) + 1 });
  return [...counts.values()]
    .sort((a, b) => Number(a.p.origin === "edible") - Number(b.p.origin === "edible") || a.p.common_name.localeCompare(b.p.common_name))
    .map(({ p, n }) => ({
      id: `plant:${p.id}`, category: "plants", item: p.common_name, qty: n, unit: n === 1 ? "plant" : "plants",
      note: p.origin === "edible" ? "Transplants or seed" : p.origin === "native" ? "Florida native" : undefined,
    }));
}

export interface ShoppingInput {
  placed: Plant[];
  landscapeAreaSqft: number;
  raisedBeds: BedDims[];
  inGroundEdibleAreaSqft: number;
  hasEdibles: boolean;
  bagFt3?: number;
  mix?: "bagged" | "1:1:1";
}

export function shoppingList(x: ShoppingInput): ShopLine[] {
  const bag = x.bagFt3 && x.bagFt3 > 0 ? x.bagFt3 : DEFAULT_BAG_FT3;
  const lines = plantLines(x.placed);

  const bedV = x.raisedBeds.reduce((s, b) => s + bedVolumeFt3(b), 0);
  if (bedV > 0) {
    const yd = r2(ft3ToYd3(bedV));
    if (x.mix === "1:1:1") {
      const third = bedV / 3;
      for (const [k, name] of [["compost", "Compost"], ["peat", "Peat moss"], ["vermiculite", "Vermiculite"]] as const) {
        lines.push({ id: `bed:${k}`, category: "soil", item: `${name} (1:1:1 mix)`, qty: bagsFor(third, bag), unit: `bags (${bag} ft³)`, note: `${r2(third)} ft³, a third of the bed` });
      }
    } else {
      lines.push({ id: "bed:soil", category: "soil", item: "Raised-bed soil", qty: bagsFor(bedV, bag), unit: `bags (${bag} ft³)`, note: `${r2(bedV)} ft³ (${yd} yd³) to fill the bed` });
    }
    const perim = x.raisedBeds.reduce((s, b) => s + 2 * (b.l_ft + b.w_ft), 0);
    const tall = Math.max(...x.raisedBeds.map((b) => b.depth_in));
    lines.push({ id: "bed:frame", category: "materials", item: "Bed frame: untreated boards or blocks", qty: r2(perim), unit: "ft of edge", note: `${tall} in tall`, optional: true });
  }
  if (x.inGroundEdibleAreaSqft > 0) {
    const v = layerFt3(x.inGroundEdibleAreaSqft, COMPOST_DEPTH_IN);
    lines.push({ id: "compost", category: "compost", item: "Compost for the vegetable bed", qty: bagsFor(v, bag), unit: `bags (${bag} ft³)`, note: `${r2(v)} ft³: ${COMPOST_DEPTH_IN} in worked into ${Math.round(x.inGroundEdibleAreaSqft)} sq ft` });
  }
  if (x.landscapeAreaSqft > 0) {
    const v = layerFt3(x.landscapeAreaSqft, MULCH_DEPTH_IN);
    lines.push({ id: "mulch", category: "mulch", item: "Mulch (pine straw, pine bark or melaleuca)", qty: bagsFor(v, 2), unit: "bags (2 ft³)", note: `${r2(v)} ft³ (${r2(ft3ToYd3(v))} yd³): ${MULCH_DEPTH_IN} in over ${Math.round(x.landscapeAreaSqft)} sq ft` });
  }
  if (x.hasEdibles) {
    lines.push({ id: "fertilizer", category: "fertilizer", item: "Balanced slow-release fertilizer (vegetables only)", qty: 1, unit: "bag", note: FERTILIZER_NOTE });
  }
  return lines;
}

/** Line total from an optional unit price; null when no price is entered. */
export const lineTotal = (l: ShopLine, price: number | null | undefined) => (price != null && price >= 0 ? r2(l.qty * price) : null);

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(lines: ShopLine[], prices: Record<string, number | null> = {}): string {
  const head = ["Category", "Item", "Quantity", "Unit", "Unit price", "Total", "Note"];
  const rows = lines.map((l) => {
    const p = prices[l.id] ?? null;
    return [l.category, l.item + (l.optional ? " (optional)" : ""), l.qty, l.unit, p, lineTotal(l, p), l.note ?? ""];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
