/** Impact metrics for a garden. Estimates only. */
import type { Plant } from "../types";
import { mean } from "./growth";

const POLLINATORS = ["butterflies", "bees", "hummingbirds"];
const LEVEL = { low: 1, medium: 2, high: 3 } as const;
const GROWTH = { slow: 1, medium: 2, fast: 3 } as const;

/** Mean mature canopy area, sq ft. */
export const matureCanopy = (p: Plant) => Math.PI * (mean(p.mature_spread_ft) / 2) ** 2;

/** Native share by count and by mature canopy area (percent 0..100). Region-native or any Florida native counts. */
export function nativePct(plants: Plant[]): { by_count: number; by_area: number } {
  if (!plants.length) return { by_count: 0, by_area: 0 };
  const nat = plants.filter((p) => p.origin === "native");
  const tot = plants.reduce((s, p) => s + matureCanopy(p), 0);
  const natA = nat.reduce((s, p) => s + matureCanopy(p), 0);
  return { by_count: Math.round((1000 * nat.length) / plants.length) / 10, by_area: tot ? Math.round((1000 * natA) / tot) / 10 : 0 };
}

/** 80 points for the share of plants serving pollinators + 20 for the share that are larval host plants. */
export function pollinatorScore(plants: Plant[]): number {
  if (!plants.length) return 0;
  const poll = plants.filter((p) => p.wildlife_value.some((w) => POLLINATORS.includes(w))).length / plants.length;
  const host = plants.filter((p) => p.host_plant_for.length > 0).length / plants.length;
  return Math.round(80 * poll + 20 * host);
}

export function bloomMonths(plants: Plant[]): number[] {
  return [...new Set(plants.flatMap((p) => p.bloom_months))].sort((a, b) => a - b);
}

/** Mean of water need (1–3) and growth rate (1–3): < 1.7 low, < 2.3 medium, else high. */
export function maintenanceLevel(plants: Plant[]): "low" | "medium" | "high" {
  if (!plants.length) return "low";
  const s = plants.reduce((a, p) => a + (LEVEL[p.water_need] + GROWTH[p.growth_rate]) / 2, 0) / plants.length;
  return s < 1.7 ? "low" : s < 2.3 ? "medium" : "high";
}

export interface Impact {
  native_pct: { by_count: number; by_area: number };
  gallons_saved_week: number;
  pollinator_score: number;
  bloom_months: number[];
  maintenance: "low" | "medium" | "high";
  plant_count: number;
  species_count: number;
}

export function impact(plants: Plant[], gallonsSavedWeek: number): Impact {
  return {
    native_pct: nativePct(plants.filter((p) => p.origin !== "edible")), // edibles never count toward native %
    gallons_saved_week: Math.round(gallonsSavedWeek),
    pollinator_score: pollinatorScore(plants),
    bloom_months: bloomMonths(plants),
    maintenance: maintenanceLevel(plants),
    plant_count: plants.length,
    species_count: new Set(plants.map((p) => p.id)).size,
  };
}
