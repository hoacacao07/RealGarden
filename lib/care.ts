/**
 * Care data shared by the garden page, the Care page and the Garden Assistant: dashboard predictions, the
 * 12-month task calendar and the "This week" list (rules, optionally reworded by Gemini without changing items).
 */
import { careWeekWording } from "./ai/features";
import { alertViews, openAlertTasks, syncGarden } from "./alerts";
import { moveFertilizer } from "./engine/alertTasks";
import { getEco } from "./eco";
import { careWeek, weekSummary, type CareItem } from "./engine/careWeek";
import { planCrops, taskCalendar, fertRuleFor, type Task } from "./engine/tasks";
import { planInputs } from "./plan";
import { buildDashboard, type Dashboard } from "./predict";
import type { GardenDoc, Plant } from "./types";

export interface CareBundle { dashboard: Dashboard; calendar: Task[]; week: CareItem[]; weekText: string; wording: "gemini" | "template" }

export interface StoredTask { id: string; title: string; due_at: string; priority: "normal" | "urgent" }

export async function careBundle(g: GardenDoc, plants: Plant[], scenario: string | null, opts: { reword?: boolean } = {}): Promise<CareBundle> {
  // Live alert sources first (60 s cache), so a new NWS alert's tasks show up on this page load.
  if (!scenario) await syncGarden(g);
  const [d, eco, alertTasks, active] = await Promise.all([
    buildDashboard(g, plants, scenario), getEco(g.id).catch(() => null),
    scenario ? Promise.resolve([]) : openAlertTasks(g.id).catch(() => []),
    scenario ? Promise.resolve([]) : alertViews(g.id, { activeOnly: true }).catch(() => []),
  ]);
  const inputs = planInputs(g, plants);
  const today = d.realToday;
  const calendar0 = taskCalendar({
    today, region: g.site.region, crops: planCrops(inputs.crops, g.site.region, today, g.starter.target_harvest), soil: inputs.soil,
    rule: fertRuleFor(g.site.lat, g.site.lon), hasLandscape: inputs.soil.some((s) => s.zone_kind === "landscape"),
    eco: { barrel: (eco?.eco.barrel_gal ?? 0) > 0, compost: !!eco?.eco.compost_bin },
  });
  // Fertilizer inside an active alert (or within 48 h of heavy rain) moves to after it (spec 7.3).
  const calendar = moveFertilizer(calendar0, active, new Date().toISOString()).tasks;
  // First-season prep (build the bed, test the pH...) is done in a garden planted more than a month ago.
  const established = g.planted_on < new Date(Date.parse(today) - 30 * 86400e3).toISOString().slice(0, 10);
  const weekCalendar = established ? calendar.filter((t) => !t.id.startsWith("prep:")) : calendar;
  const week = careWeek({
    today: d.today, alerts: d.alerts, stormPause: d.stormPause, calendar: weekCalendar, alertTasks,
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
