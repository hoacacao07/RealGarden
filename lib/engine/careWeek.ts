/**
 * "This week" care list (spec 2B, Phase 11.8). Plain-language items for the next 7 days, built by rules from what
 * the engines already decided: storm and frost steps, watering and rain skips (per zone or per pot), nearby disease
 * checks, calendar tasks (plant, fertilize, harvest, prep) and stored alert tasks. Gemini may reword the lines
 * (care_week) but never adds, removes or reorders them.
 */
import type { ActionStep, WeatherDay } from "../types";
import { addDays } from "./geo";
import type { Task } from "./tasks";

export type CareKind = "storm" | "cover" | "water" | "skip" | "check" | "plant" | "fertilize" | "harvest" | "prep";

export interface CareItem {
  id: string;
  date: string; // YYYY-MM-DD
  kind: CareKind;
  text: string;
  urgent: boolean;
  source: "weather" | "calendar" | "alert";
}

export interface CareAlert { id: string; type: "frost" | "storm" | "water" | "disease"; severity: "low" | "medium" | "high"; title: string; steps: ActionStep[] }
export interface CareZoneDay { date: string; recommendation: "water" | "skip" | "none"; gallons: number; is_forecast: boolean }
export interface CarePotDay { date: string; water: boolean }

export interface CareInput {
  today: string;
  alerts: CareAlert[];
  zones: { name: string; irrigation: string; days: CareZoneDay[] }[];
  pots: { name: string; days: CarePotDay[] }[];
  stormPause: boolean;
  harvestNow: string[];
  calendar: Task[];
  /** Phase 12 stored alert tasks (already ordered by the rules). */
  alertTasks?: { id: string; title: string; due_at: string; priority: "normal" | "urgent" }[];
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayWord = (iso: string, today: string) => {
  if (iso <= today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return DOW[new Date(iso + "T12:00:00Z").getUTCDay()];
};
const list = (xs: string[]) => {
  const u = [...new Set(xs)];
  return u.length > 1 ? `${u.slice(0, -1).join(", ")} and ${u.at(-1)}` : u[0] ?? "";
};
const KIND_ORDER: CareKind[] = ["storm", "cover", "check", "skip", "water", "prep", "plant", "fertilize", "harvest"];

export function careWeek(x: CareInput, max = 10): CareItem[] {
  const end = addDays(x.today, 6);
  const out: CareItem[] = [];
  const add = (i: CareItem) => { if (i.date <= end) out.push({ ...i, date: i.date < x.today ? x.today : i.date }); };

  // Stored alert tasks (Phase 12) come first, in their rule order.
  for (const t of x.alertTasks ?? []) add({ id: `task:${t.id}`, date: t.due_at.slice(0, 10), kind: "storm", text: t.title, urgent: t.priority === "urgent", source: "alert" });

  for (const a of x.alerts) {
    if (a.type === "storm" && !(x.alertTasks?.length)) {
      a.steps.slice(0, 3).forEach((s, i) => add({ id: `${a.id}:${i}`, date: x.today, kind: "storm", text: s.text, urgent: true, source: "weather" }));
    } else if (a.type === "frost") {
      const date = a.id.split(":")[1] ?? x.today;
      const cover = a.steps.find((s) => /cover/i.test(s.text)) ?? a.steps[0];
      add({ id: a.id, date, kind: "cover", text: cover ? `${cover.text.replace(/\.$/, "")} (cold night)` : a.title, urgent: a.severity !== "low", source: "weather" });
    } else if (a.type === "disease") {
      add({ id: a.id, date: x.today, kind: "check", text: a.steps[0]?.text ?? a.title, urgent: false, source: "weather" });
    }
  }

  if (!x.stormPause) {
    for (const z of x.zones) {
      const days = z.days.filter((d) => d.is_forecast && d.date >= x.today && d.date <= end);
      const firstWater = days.find((d) => d.recommendation === "water");
      if (firstWater) add({ id: `water:${z.name}:${firstWater.date}`, date: firstWater.date, kind: "water", text: `Water the ${z.name.toLowerCase()}${firstWater.gallons >= 1 ? ` (about ${Math.round(firstWater.gallons)} gal)` : ""}`, urgent: false, source: "weather" });
      const firstSkip = days.find((d) => d.recommendation === "skip");
      if (firstSkip) add({ id: `skip:${z.name}:${firstSkip.date}`, date: firstSkip.date, kind: "skip", text: `Skip watering the ${z.name.toLowerCase()}, rain is coming`, urgent: false, source: "weather" });
    }
    const byDay = new Map<string, string[]>();
    for (const p of x.pots) for (const d of p.days) if (d.water && d.date >= x.today && d.date <= end) byDay.set(d.date, [...(byDay.get(d.date) ?? []), p.name.toLowerCase()]);
    for (const [date, names] of [...byDay.entries()].sort().slice(0, 4)) add({ id: `pots:${date}`, date, kind: "water", text: `Water the ${list(names)} pot${names.length > 1 ? "s" : ""}`, urgent: false, source: "weather" });
  }

  for (const t of x.calendar) {
    if (t.due_at > end || t.kind === "water" || t.id === "prep:ordinance") continue;
    const kind: CareKind = t.kind === "plant" ? "plant" : t.kind === "fertilize" ? "fertilize" : t.kind === "harvest" ? "harvest" : "prep";
    add({ id: `cal:${t.id}`, date: t.due_at, kind, text: t.title, urgent: false, source: "calendar" });
  }
  if (x.harvestNow.length && !x.stormPause) add({ id: "harvest:now", date: x.today, kind: "harvest", text: `Pick ripe ${list(x.harvestNow.map((n) => n.toLowerCase()))}`, urgent: false, source: "calendar" });

  return out
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.urgent) - Number(a.urgent) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, max);
}

/** One plain sentence about this week's weather for the garden ("Hot week, water the pots every morning"). */
export function weekSummary(forecast: WeatherDay[], o: { balcony: boolean; stormPause: boolean; frost: boolean }): string {
  const wk = forecast.slice(0, 7);
  if (!wk.length) return "No forecast right now. Check the soil before you water.";
  if (o.stormPause) return "Storm on the way: watering is paused. Get the garden ready before the wind starts.";
  const hot = Math.max(...wk.map((d) => d.tmax_f));
  const rainDays = wk.filter((d) => d.rain_mm >= 6).length;
  const rain = wk.reduce((s, d) => s + d.rain_mm, 0) / 25.4;
  if (o.frost) return "Cold nights ahead: cover tender plants in the evening and uncover them in the morning.";
  if (rainDays >= 3 || rain >= 1.5) return `Rainy week (about ${rain.toFixed(1)} in): water less, rain is doing the job.`;
  if (hot >= 90) return o.balcony ? `Hot week, highs near ${Math.round(hot)}°F: water the pots every morning.` : `Hot week, highs near ${Math.round(hot)}°F: water early in the morning and check new plants.`;
  if (rainDays === 0) return "Dry week: water on the days shown, early in the morning.";
  return "Mild week: water only on the days shown.";
}
