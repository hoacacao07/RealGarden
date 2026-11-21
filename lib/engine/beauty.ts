/**
 * Beauty timeline. For each month:
 *   Beauty = 100·(0.4·fill + 0.4·bloom + 0.2·color)
 *   fill  = canopy area / bed area (cap 1)
 *   bloom = share of canopy area in bloom
 *   color = distinct flower color families in bloom / 4 (cap 1)
 */
import type { Plant, Region } from "../types";
import { colorFamily } from "./color";

export interface BeautyItem { plant: Plant; canopy_sqft: number; can_bloom: boolean }

export interface BeautyMonth { month: number; score: number; fill: number; bloom: number; color: number; families: string[]; blooming: string[] }

export function beautyMonth(items: BeautyItem[], bedSqft: number, month: number): BeautyMonth {
  const canopy = items.reduce((s, i) => s + i.canopy_sqft, 0);
  const fill = bedSqft > 0 ? Math.min(1, canopy / bedSqft) : 0;
  const inBloom = items.filter((i) => i.can_bloom && i.plant.bloom_months.includes(month) && i.plant.flower_colors.length);
  const bloomArea = inBloom.reduce((s, i) => s + i.canopy_sqft, 0);
  const bloom = canopy > 0 ? bloomArea / canopy : 0;
  const families = [...new Set(inBloom.flatMap((i) => i.plant.flower_colors.map((c) => colorFamily(c.hex))))];
  const color = Math.min(1, families.length / 4);
  return {
    month, fill, bloom, color, families,
    score: Math.round(100 * (0.4 * fill + 0.4 * bloom + 0.2 * color)),
    blooming: [...new Set(inBloom.map((i) => i.plant.common_name))],
  };
}

export interface BeautyTimeline { months: BeautyMonth[]; peak: number[]; weakest: number; suggestions: Plant[] }

/** 12-month strip, peak months (within 3 points of the best), weakest month and 2 native suggestions blooming then. */
export function beautyTimeline(items: BeautyItem[], bedSqft: number, catalog: Plant[], region: Region): BeautyTimeline {
  const months = Array.from({ length: 12 }, (_, i) => beautyMonth(items, bedSqft, i + 1));
  const max = Math.max(...months.map((m) => m.score));
  const peak = months.filter((m) => m.score >= max - 3).map((m) => m.month);
  const weakest = months.reduce((w, m) => (m.score < w.score ? m : w), months[0]).month;
  const inGarden = new Set(items.map((i) => i.plant.id));
  const suggestions = catalog
    .filter((p) => p.origin === "native" && p.regions.includes(region) && !inGarden.has(p.id))
    .filter((p) => p.bloom_months.includes(weakest) && p.flower_colors.length)
    .sort((a, b) => b.bloom_months.length - a.bloom_months.length || a.common_name.localeCompare(b.common_name))
    .slice(0, 2);
  return { months, peak, weakest, suggestions };
}
