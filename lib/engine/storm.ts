/**
 * Storm readiness. On a tropical storm, hurricane or high wind alert, rank plants by
 * risk = height_now (ft) × wind factor (1 low, 0.5 medium, 0.2 high wind tolerance).
 */
import type { Level, NwsAlert } from "../types";

export const WIND_FACTOR: Record<Level, number> = { low: 1, medium: 0.5, high: 0.2 };

export const STORM_CHECKLIST = [
  "Stake young trees with loose ties",
  "Move pots, hanging baskets and garden decor inside",
  "Pause all watering until the storm passes",
  "Clear drains, gutters and rain garden inlets",
];

export function isStormAlert(event: string): boolean {
  return /tropical storm|hurricane|high wind/i.test(event);
}

export const stormAlerts = (alerts: NwsAlert[]) => alerts.filter((a) => isStormAlert(a.event));

export const stormRisk = (heightFt: number, wind: Level) => heightFt * WIND_FACTOR[wind];

export interface StormPlant { id: string; name: string; height_ft: number; wind_tolerance: Level }

export function rankStormPlants(plants: StormPlant[], top = 5) {
  return plants
    .map((p) => ({ ...p, risk: Math.round(stormRisk(p.height_ft, p.wind_tolerance) * 100) / 100 }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, top);
}
