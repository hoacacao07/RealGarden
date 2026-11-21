/** Pure helpers for the garden canvas. */
import type { Plant, ZoneInput } from "./types";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** Back-to-front: trees and palms at the back (top of canvas), wildflowers and grasses up front. */
const TIER: Record<string, number> = { large_tree: 0, palm: 0, small_tree: 1, vine: 1, shrub: 2, fern: 2, aquatic: 3, grass: 3, wildflower: 3, vegetable: 3, herb: 3 };

/** Tiered rows, `count` of each plant spread along its row. Returns positions in ft. */
export function templateLayout(items: { plant: Plant; count: number }[], width: number, height: number) {
  const tiers = new Map<number, Plant[]>();
  for (const { plant, count } of items) {
    const t = TIER[plant.category] ?? 2;
    tiers.set(t, [...(tiers.get(t) ?? []), ...Array<Plant>(count).fill(plant)]);
  }
  const used = [...tiers.keys()].sort();
  const out: { plant_id: string; x_ft: number; y_ft: number }[] = [];
  used.forEach((t, row) => {
    const list = tiers.get(t)!;
    const y = ((row + 0.5) / used.length) * height;
    const step = width / list.length;
    list.forEach((p, i) => {
      const jitter = list.length > 3 ? (i % 2 ? 0.8 : -0.8) : 0;
      out.push({ plant_id: p.id, x_ft: round1(clamp(step * (i + 0.5), 1, width - 1)), y_ft: round1(clamp(y + jitter, 1, height - 1)) });
    });
  });
  return out;
}

/** Next open spot on a lattice of `s` ft that is at least `s` ft from every existing plant. */
export function nextFreeSpot(points: { x_ft: number; y_ft: number }[], width: number, height: number, s = 3) {
  for (let y = s / 2 + 0.5; y < height; y += s) {
    for (let x = s / 2 + 0.5; x < width; x += s) {
      if (points.every((t) => Math.hypot(t.x_ft - x, t.y_ft - y) >= s)) return { x_ft: round1(x), y_ft: round1(y) };
    }
  }
  return { x_ft: round1(width / 2), y_ft: round1(height / 2) };
}

/** Canvas size in feet from yard area, roughly 8:5 (min 16 x 10, max 80 x 50). */
export function canvasSize(areaSqft: number) {
  const w = clamp(Math.round(Math.sqrt((areaSqft * 8) / 5)), 16, 80);
  return { width: w, height: Math.round((w * 5) / 8) };
}

/** Default zones: the canvas split into a drip bed (left 2/3) and a spray border (right 1/3). */
export function defaultZones(width: number, height: number): ZoneInput[] {
  const split = round1((width * 2) / 3);
  return [
    { id: "z_bed", name: "Main bed", irrigation: "drip", polygon: [[0.5, 0.5], [split - 0.5, 0.5], [split - 0.5, height - 0.5], [0.5, height - 0.5]] },
    { id: "z_border", name: "Border", irrigation: "spray", polygon: [[split + 0.5, 0.5], [width - 0.5, 0.5], [width - 0.5, height - 0.5], [split + 0.5, height - 0.5]] },
  ];
}

/** Next open spot inside a rectangle (x, y, w, h in ft), or null when it is full. Used to drop edibles into the edible bed. */
export function nextFreeSpotIn(points: { x_ft: number; y_ft: number }[], r: { x: number; y: number; w: number; h: number }, s = 1) {
  for (let y = r.y + s / 2; y <= r.y + r.h - s / 2 + 1e-9; y += s) {
    for (let x = r.x + s / 2; x <= r.x + r.w - s / 2 + 1e-9; x += s) {
      if (points.every((t) => Math.hypot(t.x_ft - x, t.y_ft - y) >= s * 0.95)) return { x_ft: round1(x), y_ft: round1(y) };
    }
  }
  return null;
}

/** Bounding box of a polygon as a rectangle. */
export function polyRect(poly: [number, number][]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
