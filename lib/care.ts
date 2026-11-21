/**
 * Care data shared by the garden page, the Care page and the Garden Assistant: dashboard predictions, the
 * 12-month task calendar and the "This week" list (rules, optionally reworded by Gemini without changing items).
 */
import { careWeekWording } from "./ai/features";
import { getEco } from "./eco";
import { careWeek, weekSummary, type CareItem } from "./engine/careWeek";
import { planCrops, taskCalendar, fertRuleFor, type Task } from "./engine/tasks";
import { planInputs } from "./plan";
import { buildDashboard, type Dashboard } from "./predict";
import type { GardenDoc, Plant } from "./types";

export interface CareBundle { dashboard: Dashboard; calendar: Task[]; week: CareItem[]; weekText: string; wording: "gemini" | "template" }

export interface StoredTask { id: string; title: string; due_at: string; priority: "normal" | "urgent" }

export async function careBundle(g: GardenDoc, plants: Plant[], scenario: string | null, opts: { alertTasks?: StoredTask[]; reword?: boolean } = {}): Promise<CareBundle> {
  const [d, eco] = await Promise.all([buildDashboard(g, plants, scenario), getEco(g.id).catch(() => null)]);
  const inputs = planInputs(g, plants);
  const today = d.realToday;
  const calendar = taskCalendar({
    today, region: g.site.region, crops: planCrops(inputs.crops, g.site.region, today, g.starter.target_harvest), soil: inputs.soil,
    rule: fertRuleFor(g.site.lat, g.site.lon), hasLandscape: inputs.soil.some((s) => s.zone_kind === "landscape"),
    eco: { barrel: (eco?.eco.barrel_gal ?? 0) > 0, compost: !!eco?.eco.compost_bin },
  });
  // First-season prep (build the bed, test the pH...) is done in a garden planted more than a month ago.
  const established = g.planted_on < new Date(Date.parse(today) - 30 * 86400e3).toISOString().slice(0, 10);
  const weekCalendar = established ? calendar.filter((t) => !t.id.startsWith("prep:")) : calendar;
  const week = careWeek({
    today: d.today, alerts: d.alerts, stormPause: d.stormPause, calendar: weekCalendar, alertTasks: opts.alertTasks,
    zones: d.zones.map((z) => ({ name: z.name, irrigation: z.irrigation, days: z.days })),
    pots: d.pots.map((p) => ({ name: p.name, days: p.days })),
    harvestNow: d.comingUp.filter((c) => c.event === "harvest" && c.now).map((c) => c.name),
  });
  let wording: CareBundle["wording"] = "template";
  if (opts.reword && week.length) {
    const w = await careWeekWording(week.map((i) => i.text));
    if (w.source === "gemini") {
      w.items.forEach((t, i) => (week[i] = { ...week[i], text: t }));
      wording = "gemini";
    }
  }
  const weekText = weekSummary(d.forecast, { balcony: g.site.kind === "balcony", stormPause: d.stormPause, frost: d.alerts.some((a) => a.type === "frost") });
  return { dashboard: d, calendar, week, weekText, wording };
}
