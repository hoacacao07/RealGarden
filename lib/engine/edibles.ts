/**
 * Edible crop helpers (Phase 11). Pure date math on ISO dates (YYYY-MM-DD, UTC noon, no time zones).
 *   planting window: inclusive month ranges; [8, 3] wraps the new year
 *   back-calculation: plant_date = harvest_date − days_to_harvest (upper bound, so the crop is ready by the target)
 *   harvest window: [plant + dth_min, plant + dth_max + harvest_weeks·7]
 *   stage Kc (FAO-56): ini for the initial stage, linear ini→mid over development, mid, linear mid→end over late season
 */
import type { EdibleInfo, MonthWindow, Plant } from "../types";
import { addDays, monthOf } from "./geo";

export const isEdible = (p: Pick<Plant, "origin">) => p.origin === "edible";

export function inWindow(month: number, windows: MonthWindow[]): boolean {
  return windows.some(([a, b]) => (a <= b ? month >= a && month <= b : month >= a || month <= b));
}

const firstOfMonth = (iso: string, addMonths = 0) => {
  const [y, m] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + addMonths, 1));
  return t.toISOString().slice(0, 10);
};

/** Earliest date on or after `fromIso` inside a planting window (the date itself, or the 1st of the next window month). */
export function nextPlantingDate(windows: MonthWindow[], fromIso: string): string | null {
  if (!windows.length) return null;
  if (inWindow(monthOf(fromIso), windows)) return fromIso;
  for (let k = 1; k <= 12; k++) {
    const d = firstOfMonth(fromIso, k);
    if (inWindow(monthOf(d), windows)) return d;
  }
  return null;
}

/** Days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400e3);
}

/** Back-calculate the planting date for a target harvest. Flags dates outside the region's window. */
export function plantDateForHarvest(e: Pick<EdibleInfo, "days_to_harvest">, harvestIso: string, windows: MonthWindow[]) {
  const date = addDays(harvestIso, -e.days_to_harvest[1]);
  return { date, in_window: inWindow(monthOf(date), windows) };
}

export function harvestWindow(e: Pick<EdibleInfo, "days_to_harvest" | "harvest_weeks">, plantIso: string): { start: string; end: string } {
  return { start: addDays(plantIso, e.days_to_harvest[0]), end: addDays(plantIso, e.days_to_harvest[1] + e.harvest_weeks * 7) };
}

export type KcStage = "initial" | "development" | "mid" | "late" | "done";

/** Crop coefficient by days since planting (FAO-56 piecewise linear curve). */
export function stageKc(e: Pick<EdibleInfo, "kc_stages">, days: number): { kc: number; stage: KcStage } {
  const { ini, mid, end, stage_days: [l1, l2, l3, l4] } = e.kc_stages;
  const d = Math.max(0, days);
  if (d < l1) return { kc: ini, stage: "initial" };
  if (d < l1 + l2) return { kc: ini + ((d - l1) / l2) * (mid - ini), stage: "development" };
  if (d < l1 + l2 + l3) return { kc: mid, stage: "mid" };
  if (d < l1 + l2 + l3 + l4) return { kc: mid + ((d - l1 - l2 - l3) / l4) * (end - mid), stage: "late" };
  return { kc: end, stage: "done" };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Jan to Mar, Aug to Sep" */
export function windowText(windows: MonthWindow[]): string {
  return windows.map(([a, b]) => (a === b ? MON[a - 1] : `${MON[a - 1]} to ${MON[b - 1]}`)).join(", ");
}
