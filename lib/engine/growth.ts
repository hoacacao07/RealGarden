/**
 * Logistic growth.
 * h(t) = H / (1 + ((H − h0)/h0)·e^(−r·t))
 *   H = mean mature height (ft), h0 = planting height (ft), t = years since planting,
 *   r = 0.35 / 0.6 / 0.9 per year for slow / medium / fast.
 * Spread (canopy diameter, ft) follows the same curve scaled to the mean mature spread.
 */
import type { Plant } from "../types";

export const GROWTH_R = { slow: 0.35, medium: 0.6, fast: 0.9 } as const;

export const mean = (pair: [number, number]) => (pair[0] + pair[1]) / 2;

/** Height in ft after `years`. */
export function heightAt(p: Pick<Plant, "mature_height_ft" | "planting_height_ft" | "growth_rate">, years: number): number {
  const H = mean(p.mature_height_ft);
  const h0 = Math.max(0.1, Math.min(p.planting_height_ft, H));
  if (h0 >= H) return H;
  const r = GROWTH_R[p.growth_rate];
  return H / (1 + ((H - h0) / h0) * Math.exp(-r * Math.max(0, years)));
}

/** Canopy diameter in ft after `years`. */
export function spreadAt(p: Pick<Plant, "mature_height_ft" | "mature_spread_ft" | "planting_height_ft" | "growth_rate">, years: number): number {
  return (mean(p.mature_spread_ft) * heightAt(p, years)) / mean(p.mature_height_ft);
}

/** Canopy area in sq ft after `years`. */
export function canopyAreaAt(p: Plant, years: number): number {
  const r = spreadAt(p, years) / 2;
  return Math.PI * r * r;
}

export interface GrownPlacement {
  id: string;
  plant: Plant;
  x_ft: number;
  y_ft: number;
  height_ft: number;
  radius_ft: number;
  shaded_by: string[];
}

export interface ShadeWarning { placement_id: string; message: string }

/**
 * Size every placement at `years` after planting and flag sun-only plants that end up
 * under the canopy circle of a taller neighbor.
 */
export function gardenGrowth(
  placements: { id: string; plant: Plant; x_ft: number; y_ft: number; age_offset_years?: number }[],
  years: number,
): { grown: GrownPlacement[]; warnings: ShadeWarning[] } {
  const grown: GrownPlacement[] = placements.map((p) => {
    const t = years + (p.age_offset_years ?? 0);
    return { id: p.id, plant: p.plant, x_ft: p.x_ft, y_ft: p.y_ft, height_ft: heightAt(p.plant, t), radius_ft: spreadAt(p.plant, t) / 2, shaded_by: [] };
  });
  const warnings: ShadeWarning[] = [];
  for (const b of grown) {
    for (const a of grown) {
      if (a === b || a.height_ft <= b.height_ft) continue;
      if (Math.hypot(a.x_ft - b.x_ft, a.y_ft - b.y_ft) < a.radius_ft) b.shaded_by.push(a.id);
    }
    const sunOnly = b.plant.light.length === 1 && b.plant.light[0] === "full_sun";
    if (b.shaded_by.length && sunOnly) {
      const names = [...new Set(grown.filter((g) => b.shaded_by.includes(g.id)).map((g) => g.plant.common_name))].join(", ");
      warnings.push({
        placement_id: b.id,
        message: `${b.plant.common_name} needs full sun but will be under ${names} by year ${Math.round(years * 10) / 10}.`,
      });
    }
  }
  return { grown, warnings };
}
