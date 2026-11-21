/**
 * Garden Assistant tools (spec 3B.5, 7B.2). Each tool is bound to the garden the user has open, so the model can
 * never read or write another garden (no garden_id argument). Read tools return compact JSON (about 2 KB at most);
 * write tools (propose_task, propose_add_plant) never run here: chatWithTools turns them into proposals and
 * /api/chat/confirm performs the write after the user taps Confirm.
 *
 * Data comes through a ToolCtx so the router is testable without a database (see tests/assistant.test.ts).
 */
import { z } from "zod";

import { groupOf, isBlocked, isEdible, isNative } from "../catalog";
import type { AlertView } from "../alerts";
import type { CareBundle } from "../care";
import type { EcoReport, Swap } from "../engine/eco/report";
import type { ShopLine } from "../engine/shopping";
import { plantWhen } from "../engine/suggest";
import type { GardenDoc, Plant } from "../types";
import type { ToolDef } from "./gemini";

export interface ChatTask { id: string; title: string; detail: string | null; due_at: string; done: boolean }

export interface ToolCtx {
  garden: GardenDoc;
  plants: Plant[];
  today: string;
  care: () => Promise<CareBundle>;
  alerts: () => Promise<AlertView[]>;
  chatTasks: () => Promise<ChatTask[]>;
  shopping: () => ShopLine[];
  eco: () => Promise<{ report: EcoReport; swaps: Swap[] } | null>;
  zone: (zip: string) => Promise<unknown>;
}

const MAX_JSON = 2000;

/** Trim a result to about 2 KB: arrays are shortened until the JSON fits, and the cut is reported. */
export function compact<T>(value: T, max = MAX_JSON): T | { items: unknown[]; truncated: number } {
  if (JSON.stringify(value).length <= max) return value;
  if (Array.isArray(value)) {
    let n = value.length;
    while (n > 1 && JSON.stringify(value.slice(0, n)).length > max - 40) n = Math.ceil(n * 0.7) - (n === Math.ceil(n * 0.7) ? 1 : 0);
    return { items: value.slice(0, n), truncated: value.length - n };
  }
  return value;
}

const plantCard = (p: Plant) => ({
  id: p.id, name: p.common_name, scientific: p.scientific_name, group: groupOf(p), native: isNative(p), edible: isEdible(p),
  sun: p.light, water: p.water_need, height_ft: p.mature_height_ft, salt: p.salt_tolerance, cold_hardy_f: p.cold_hardy_f,
  ...(p.fl_notes && { tip: p.fl_notes }), ...(p.source_urls[0] && { source_url: p.source_urls[0] }),
});

const plantDetail = (p: Plant, g: GardenDoc, today: string) => ({
  ...plantCard(p), form: p.form, regions: p.regions, spread_ft: p.mature_spread_ft, spacing_ft: p.spacing_ft, growth_rate: p.growth_rate,
  bloom_months: p.bloom_months, fruit_months: p.fruit_months, flower_colors: p.flower_colors.map((c) => c.name),
  wildlife: p.wildlife_value, host_plant_for: p.host_plant_for, common_issues: p.common_issues, ph_range: p.ph_range,
  container_ok: !!p.container_ok, native_alternatives: p.native_alternatives, planting: plantWhen(p, g.site, today).label,
  ...(p.edible && { days_to_harvest: (p.edible as { days_to_harvest?: unknown }).days_to_harvest }),
});

export const ProposeTaskZ = z.object({
  title: z.string().trim().min(3).max(120),
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  detail: z.string().trim().max(400).optional(),
});
export const ProposeAddPlantZ = z.object({ plant_id: z.string().min(1).max(64), qty: z.number().int().min(1).max(20) });
export type ProposeTask = z.infer<typeof ProposeTaskZ>;
export type ProposeAddPlant = z.infer<typeof ProposeAddPlantZ>;

const none = { type: "object", properties: {} } as const;
const NoArgs = z.object({}).passthrough();

export function assistantTools(ctx: ToolCtx): ToolDef<any>[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { garden: g, plants, today } = ctx;
  const byId = new Map(plants.map((p) => [p.id, p]));
  const usable = plants.filter((p) => !isBlocked(p));

  const tools: ToolDef<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
    {
      name: "get_garden",
      description: "The user's garden: location, region, hardiness zone, kind (yard or balcony), sun, soil, size, chosen styles and the plants placed.",
      parameters: none, input: NoArgs,
      label: () => "Looked at your garden",
      handler: async () => {
        const counts = new Map<string, number>();
        for (const pl of g.placements) counts.set(pl.plant_id, (counts.get(pl.plant_id) ?? 0) + 1);
        return {
          name: g.name, kind: g.site.kind, place: g.site.name, region: g.site.region, zip: g.site.zip ?? null,
          hardiness_zone: g.starter.hardiness_zone ?? null, sun: g.site.sun, soil: g.site.soil, drainage: g.site.drainage,
          ph: g.site.ph ?? null, area_sqft: g.site.area_sqft, coast_mi: g.site.coastal_distance_mi, planted_on: g.planted_on,
          styles: g.starter.themes ?? [], prefer_natives: g.starter.prefer_natives ?? "off",
          beds: g.zones.map((z) => ({ name: z.name, kind: z.kind ?? "landscape", bed: z.bed ?? null, irrigation: z.irrigation })),
          plants: [...counts].map(([id, n]) => ({ id, name: byId.get(id)?.common_name ?? id, count: n })),
        };
      },
    },
    {
      name: "search_plants",
      description: "Search the app's plant catalog (invasive plants are never returned). Use for 'what can I plant', ideas, or alternatives.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words in the common or scientific name, or a use like 'butterfly'." },
          group: { type: "string", enum: ["vegetable", "herb", "fruit", "flower", "native", "shrub", "tree", "groundcover", "grass", "vine", "palm"] },
          native: { type: "boolean" }, edible: { type: "boolean" },
          sun: { type: "string", enum: ["full_sun", "partial_shade", "full_shade"] },
          container_ok: { type: "boolean" },
          plant_now: { type: "boolean", description: "Only plants that can go in the ground within the next 2 weeks for this garden's region." },
          limit: { type: "integer", minimum: 1, maximum: 15 },
        },
      },
      input: z.object({
        query: z.string().max(60).optional(), group: z.string().max(20).optional(), native: z.boolean().optional(), edible: z.boolean().optional(),
        sun: z.enum(["full_sun", "partial_shade", "full_shade"]).optional(), container_ok: z.boolean().optional(), plant_now: z.boolean().optional(),
        limit: z.number().int().min(1).max(15).optional(),
      }),
      label: (_i, r) => `Looked up ${(r as { count?: number })?.count ?? 0} plants`,
      handler: async (q: { query?: string; group?: string; native?: boolean; edible?: boolean; sun?: string; container_ok?: boolean; plant_now?: boolean; limit?: number }) => {
        const words = (q.query ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
        const hit = usable.filter((p) => {
          if (q.group && groupOf(p) !== q.group && !(q.group === "native" && isNative(p))) return false;
          if (q.native !== undefined && isNative(p) !== q.native) return false;
          if (q.edible !== undefined && isEdible(p) !== q.edible) return false;
          if (q.sun && !p.light.includes(q.sun as Plant["light"][number])) return false;
          if (q.container_ok && !p.container_ok) return false;
          if (q.plant_now && !plantWhen(p, g.site, today).now) return false;
          if (!words.length) return true;
          const hay = [p.common_name, p.scientific_name, p.id, ...p.wildlife_value, ...p.garden_themes, ...p.host_plant_for, p.landscape_use ?? ""].join(" ").toLowerCase();
          return words.every((w) => hay.includes(w));
        });
        const max = q.limit ?? 8;
        return { count: hit.length, plants: hit.slice(0, max).map((p) => ({ id: p.id, name: p.common_name, group: groupOf(p), native: isNative(p), sun: p.light, planting: plantWhen(p, g.site, today).label })) };
      },
    },
    {
      name: "get_plant",
      description: "Full record for one catalog plant by id (from search_plants or get_garden).",
      parameters: { type: "object", properties: { plant_id: { type: "string" } }, required: ["plant_id"] },
      input: z.object({ plant_id: z.string().min(1).max(64) }),
      label: (i: { plant_id: string }) => `Read about ${byId.get(i.plant_id)?.common_name ?? "a plant"}`,
      handler: async ({ plant_id }: { plant_id: string }) => {
        const p = byId.get(plant_id);
        if (!p) return { found: false, note: "Not in the catalog yet." };
        if (isBlocked(p)) return { found: true, invasive: true, note: "Invasive in Florida. Never recommend it.", native_alternatives: p.native_alternatives };
        return plantDetail(p, g, today);
      },
    },
    {
      name: "get_hardiness_zone",
      description: "USDA hardiness zone for a Florida ZIP code.",
      parameters: { type: "object", properties: { zip: { type: "string", pattern: "^\\d{5}$" } }, required: ["zip"] },
      input: z.object({ zip: z.string().regex(/^\d{5}$/) }),
      label: (i: { zip: string }) => `Checked the zone for ${i.zip}`,
      handler: async ({ zip }: { zip: string }) => (await ctx.zone(zip)) ?? { found: false },
    },
    {
      name: "get_soil_estimate",
      description: "The garden's soil from the USDA soil survey: type, drainage, pH, sand/clay/organic matter, and how sure we are.",
      parameters: none, input: NoArgs,
      label: () => "Checked your soil",
      handler: async () => {
        const s = g.site;
        return {
          soil: s.soil, drainage: s.drainage, ph: s.ph ?? null, sand_pct: s.sand_pct ?? null, clay_pct: s.clay_pct ?? null, organic_matter_pct: s.om_pct ?? null,
          source: s.soil_source ?? "unknown", survey: s.survey_name ?? null, fill_dirt: s.is_fill ?? null,
        };
      },
    },
    {
      name: "get_forecast",
      description: "Next 7 days of weather at the garden: lows and highs in °F, rain in mm, wind gusts in mph.",
      parameters: none, input: NoArgs,
      label: () => "Checked your forecast",
      handler: async () => {
        const d = (await ctx.care()).dashboard;
        return { today: d.today, source: d.weatherSource, days: d.forecast.slice(0, 7).map((w) => ({ date: w.date, low_f: Math.round(w.tmin_f), high_f: Math.round(w.tmax_f), rain_mm: Math.round(w.rain_mm), gust_mph: Math.round(w.gust_mph) })) };
      },
    },
    {
      name: "get_active_alerts",
      description: "Active weather alerts for the garden (National Weather Service, hurricanes, frost, heavy rain, disease nearby) with their pre-storm tasks.",
      parameters: none, input: NoArgs,
      label: () => "Checked weather alerts",
      handler: async () => {
        const [nws, care] = await Promise.all([ctx.alerts().catch(() => []), ctx.care()]);
        return {
          official: nws.map((a) => ({ event: a.event, headline: a.headline, severity: a.severity, ends: a.ends, safety: a.safety, open_tasks: a.tasks.filter((t) => !t.done && !t.closed_reason).map((t) => t.title).slice(0, 8) })),
          garden: care.dashboard.alerts.map((a) => ({ type: a.type, severity: a.severity, title: a.title, why: a.why, steps: a.steps.slice(0, 5).map((s) => `${s.when}: ${s.text}`) })),
          storm_pause_watering: care.dashboard.stormPause,
        };
      },
    },
    {
      name: "get_tasks",
      description: "The user's garden tasks: this week's care list, tasks they added, and the calendar for the next N days (default 30).",
      parameters: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 120 } } },
      input: z.object({ days: z.number().int().min(1).max(120).optional() }),
      label: () => "Looked at your task list",
      handler: async ({ days = 30 }: { days?: number }) => {
        const [care, mine] = await Promise.all([ctx.care(), ctx.chatTasks().catch(() => [])]);
        const end = addDaysIso(today, days);
        return compact({
          this_week: care.week.map((i) => i.text),
          added_by_you: mine.filter((t) => !t.done).map((t) => ({ title: t.title, due: t.due_at })),
          calendar: care.calendar.filter((t) => t.due_at >= today && t.due_at <= end).slice(0, 20).map((t) => ({ due: t.due_at, title: t.title, kind: t.kind })),
        });
      },
    },
    {
      name: "get_watering_plan",
      description: "Watering plan for the next days per bed (or per pot on a balcony): when to water, how much, and why.",
      parameters: none, input: NoArgs,
      label: () => "Checked your watering plan",
      handler: async () => {
        const d = (await ctx.care()).dashboard;
        return compact({
          storm_pause: d.stormPause,
          beds: d.zones.map((z) => ({ name: z.name, irrigation: z.irrigation, why: z.why, water_on: z.days.filter((x) => x.irrigation_mm > 0).map((x) => ({ date: x.date, gallons: Math.round(x.gallons) })).slice(0, 7) })),
          pots: d.pots.map((p) => ({ name: p.name, summary: p.summary })),
        });
      },
    },
    {
      name: "get_predictions",
      description: "Coming up in the garden: expected bloom, fruit and harvest windows (estimates).",
      parameters: none, input: NoArgs,
      label: () => "Checked what's coming up",
      handler: async () => compact((await ctx.care()).dashboard.comingUp.slice(0, 12).map((c) => ({ plant: c.name, event: c.event, now: c.now, count: c.count, ...pick(c, ["start", "end", "label", "confidence"]) }))),
    },
    {
      name: "get_shopping_list",
      description: "What to buy for this garden: plants, soil, compost, mulch, fertilizer, containers.",
      parameters: none, input: NoArgs,
      label: () => "Checked your shopping list",
      handler: async () => compact(ctx.shopping().map((l) => ({ item: l.item, qty: l.qty, unit: l.unit, ...(l.optional && { optional: true }) }))),
    },
    {
      name: "get_eco_report",
      description: "The garden's sustainability report (Sustainable section): eco score, grade, metrics and greener swaps.",
      parameters: none, input: NoArgs,
      label: () => "Checked your eco report",
      handler: async () => {
        const e = await ctx.eco();
        if (!e) return { available: false };
        return compact({ score: e.report.score, grade: e.report.grade, metrics: e.report.metrics.map((m) => ({ id: m.id, title: m.title, value: m.value, detail: m.detail })), swaps: e.swaps.slice(0, 4).map((s) => ({ title: s.title, gain: s.delta })) });
      },
    },
    {
      name: "propose_task",
      description: "Suggest adding a task to the user's care list. Shows the user a card with a Confirm button; it is NOT added until they confirm.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" }, due_at: { type: "string", description: "YYYY-MM-DD" }, detail: { type: "string" } },
        required: ["title", "due_at"],
      },
      input: ProposeTaskZ, write: true,
      label: () => "Suggested a task",
    },
    {
      name: "propose_add_plant",
      description: "Suggest adding a catalog plant to the user's garden. Shows a card with a Confirm button; it is NOT added until they confirm.",
      parameters: { type: "object", properties: { plant_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } }, required: ["plant_id", "qty"] },
      input: ProposeAddPlantZ, write: true,
      label: (i: { plant_id: string }) => `Suggested ${byId.get(i.plant_id)?.common_name ?? "a plant"}`,
    },
  ];
  return tools;
}

/** Write tools: names accepted by /api/chat/confirm, with their validators. */
export const WRITE_TOOLS = { propose_task: ProposeTaskZ, propose_add_plant: ProposeAddPlantZ } as const;
export type WriteToolName = keyof typeof WRITE_TOOLS;

/** Short context for the model: the garden summary sent with every chat turn. */
export function gardenSummary(g: GardenDoc, plants: Plant[], today: string): string {
  const byId = new Map(plants.map((p) => [p.id, p.common_name]));
  const names = [...new Set(g.placements.map((p) => byId.get(p.plant_id) ?? p.plant_id))];
  return [
    `Today is ${today}. Garden "${g.name}" (${g.site.kind}) in ${g.site.name || "Florida"}, ${g.site.region} Florida`,
    g.starter.hardiness_zone ? `USDA zone ${g.starter.hardiness_zone}` : null,
    `${g.site.sun.replace("_", " ")}, ${g.site.soil} soil`,
    names.length ? `${g.placements.length} plants: ${names.slice(0, 12).join(", ")}${names.length > 12 ? "…" : ""}` : "no plants placed yet",
    g.starter.prefer_natives && g.starter.prefer_natives !== "off" ? "prefers native plants" : null,
  ].filter(Boolean).join("; ") + ".";
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function pick(o: object, keys: string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const k of keys) if (k in o) r[k] = (o as Record<string, unknown>)[k];
  return r;
}
