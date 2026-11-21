/**
 * Spacing. Square grid n ≈ A/s², offset (triangular) grid n ≈ A/(s²·√3/2), A sq ft, s ft.
 * Overcrowding when two plants sit closer than 0.8 × their spacing_ft (mean of the pair).
 */
import { pointInPolygon } from "./geo";

export const squareCount = (areaSqft: number, s: number) => Math.floor(areaSqft / (s * s));
export const offsetCount = (areaSqft: number, s: number) => Math.floor(areaSqft / ((s * s * Math.sqrt(3)) / 2));

export interface Spot { id: string; x_ft: number; y_ft: number; spacing_ft: number; name: string }

export function overcrowded(spots: Spot[]): { a: string; b: string; distance_ft: number; min_ft: number; message: string }[] {
  const out = [];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i];
      const b = spots[j];
      const d = Math.hypot(a.x_ft - b.x_ft, a.y_ft - b.y_ft);
      const min = 0.8 * ((a.spacing_ft + b.spacing_ft) / 2);
      if (d < min) {
        out.push({ a: a.id, b: b.id, distance_ft: d, min_ft: min, message: `${a.name} and ${b.name} are ${d.toFixed(1)} ft apart (need ${min.toFixed(1)} ft)` });
      }
    }
  }
  return out;
}

/**
 * Bed fill: positions on an offset grid with spacing s inside a rectangle (x, y, w, h in ft),
 * optionally clipped to a polygon, limited to `max` plants.
 */
export function fillBed(rect: { x: number; y: number; w: number; h: number }, s: number, max = Infinity, clip?: [number, number][]) {
  const pts: { x_ft: number; y_ft: number }[] = [];
  const rowH = (s * Math.sqrt(3)) / 2;
  for (let row = 0, y = rect.y + s / 2; y <= rect.y + rect.h - s / 2 + 1e-9; row++, y += rowH) {
    const off = row % 2 ? s / 2 : 0;
    for (let x = rect.x + s / 2 + off; x <= rect.x + rect.w - s / 2 + 1e-9; x += s) {
      if (clip && !pointInPolygon(x, y, clip)) continue;
      pts.push({ x_ft: Math.round(x * 100) / 100, y_ft: Math.round(y * 100) / 100 });
      if (pts.length >= max) return pts;
    }
  }
  return pts;
}
