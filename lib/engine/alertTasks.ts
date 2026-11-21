/**
 * Alert → task rules (Phase 12, spec 7.3). Deterministic, keyed by the NWS `event`. Each rule returns tasks with
 * deadlines relative to `onset` (or now when missing), a priority and which plants they apply to.
 *
 *   Hurricane / Tropical Storm Watch      urgent  stake young trees, pots inside, harvest, clear drains, pause irrigation, no fertilizer or pruning
 *   Hurricane / Tropical Storm Warning    urgent  same, due within hours, plus "secure loose garden items that could fly"
 *   Flood Warning / Flash Flood Warning / Flood Watch   urgent  pause irrigation, containers to higher ground, protect low beds, no fertilizer, check standing water after
 *   Heavy rain (no NWS alert): ≥ 50 mm in 24 h          normal  pause irrigation, cover seedlings, postpone fertilizer, check drainage after
 *   Severe Thunderstorm Warning           urgent  bring in pots and light items, nothing else outdoors
 *   High Wind Warning / Wind Advisory     normal  stake tall plants, move pots
 *   Freeze Warning / Frost Advisory / Hard Freeze Warning   urgent  water soil in the afternoon, cover tender plants, uncover in the morning
 *   Heat Advisory / Excessive Heat Warning                  normal  water edibles early, shade seedlings
 * Balcony gardens: on wind, tropical or severe storm alerts the first task is always "Bring every pot, basket and
 * trellis inside" (spec 6B.8); heavy rain adds "empty saucers". Every urgent list starts with the safety line.
 * Garden tasks are for before the storm only. Gemini may reword tasks but never add, remove or reorder them.
 */
import { BRING_INSIDE, EMPTY_SAUCERS, SAFETY_LINE } from "./balcony";

export const HEAVY_RAIN_MM_24H = 50;
export const FREEZE_SAFETY = "Follow official instructions from your county.";

export type RuleId = "tropical_watch" | "tropical_warning" | "flood" | "heavy_rain" | "severe_thunderstorm" | "wind" | "freeze" | "heat";
export type AlertTaskKind = "safety" | "protect" | "water" | "harvest" | "fertilize" | "check" | "followup";

export interface AlertIn { event: string; onset?: string | null; ends?: string | null }
export interface RuleTask { kind: AlertTaskKind; title: string; detail?: string; due_at: string; priority: "urgent" | "normal"; plants?: string[] }
export interface RuleResult { rule: RuleId; priority: "urgent" | "normal"; safety: string | null; pauses_water: boolean; blocks_fertilizer: boolean; tasks: RuleTask[] }

export interface AlertCtx {
  now: string; // ISO timestamp
  balcony: boolean;
  /** Plant names by role, for plant-specific wording. */
  young_trees?: string[];
  tall?: string[];
  tender?: string[];
  edibles?: string[];
  ripe?: string[];
  /** Sustainable section links (spec 6D.6). */
  barrel_gal?: number;
  barrel_fill_gal?: number;
  rain_garden_gal?: number;
}

export function ruleFor(event: string): RuleId | null {
  const e = event.toLowerCase();
  if (/(hurricane|tropical storm) warning/.test(e)) return "tropical_warning";
  if (/(hurricane|tropical storm) watch/.test(e)) return "tropical_watch";
  if (/flash flood warning|flood warning|flood watch|flash flood watch/.test(e)) return "flood";
  if (/heavy rain/.test(e)) return "heavy_rain";
  if (/severe thunderstorm warning/.test(e)) return "severe_thunderstorm";
  if (/high wind warning|wind advisory|high wind watch/.test(e)) return "wind";
  if (/freeze warning|frost advisory|hard freeze|freeze watch/.test(e)) return "freeze";
  if (/heat advisory|excessive heat|extreme heat/.test(e)) return "heat";
  return null;
}

/** Watering recommendations pause while a rain, flood or tropical alert is active. */
export const pausesWater = (event: string) => ["tropical_warning", "tropical_watch", "flood", "heavy_rain", "severe_thunderstorm"].includes(ruleFor(event) ?? "");

const hours = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600e3).toISOString();
const names = (xs: string[] | undefined, fallback: string) => {
  const u = [...new Set(xs ?? [])].slice(0, 3);
  if (!u.length) return fallback;
  return u.length > 1 ? `${u.slice(0, -1).join(", ")} and ${u.at(-1)}` : u[0];
};

/** Deadline: `before` hours ahead of onset, but never in the past and never later than onset. */
function dueBefore(a: AlertIn, now: string, before: number, fallbackAhead: number): string {
  const onset = a.onset && Date.parse(a.onset) > Date.parse(now) ? a.onset : null;
  if (!onset) return hours(now, fallbackAhead);
  const d = hours(onset, -before);
  return Date.parse(d) < Date.parse(now) ? now : d;
}

export function alertTasks(a: AlertIn, ctx: AlertCtx): RuleResult | null {
  const rule = ruleFor(a.event);
  if (!rule) return null;
  const t: RuleTask[] = [];
  const push = (kind: AlertTaskKind, title: string, due_at: string, priority: "urgent" | "normal", extra: Partial<RuleTask> = {}) => t.push({ kind, title, due_at, priority, ...extra });
  const after = a.ends && Date.parse(a.ends) > Date.parse(ctx.now) ? a.ends : hours(ctx.now, 24);
  let priority: "urgent" | "normal" = "urgent";
  let safety: string | null = SAFETY_LINE;

  switch (rule) {
    case "tropical_watch":
    case "tropical_warning": {
      const warn = rule === "tropical_warning";
      const due = dueBefore(a, ctx.now, warn ? 6 : 24, warn ? 3 : 12);
      if (ctx.balcony) push("protect", BRING_INSIDE, ctx.now, "urgent");
      if (!ctx.balcony) push("protect", `Stake young trees with loose ties: ${names(ctx.young_trees, "young trees and tall shrubs")}`, due, "urgent", { plants: ctx.young_trees });
      else push("protect", "Take down hanging baskets and railing planters", due, "urgent");
      if (!ctx.balcony) push("protect", "Move pots and hanging baskets inside", due, "urgent");
      push("harvest", ctx.ripe?.length ? `Harvest ripe ${names(ctx.ripe, "vegetables")} now` : "Harvest any ripe vegetables now", due, "urgent", { plants: ctx.ripe });
      if (!ctx.balcony) push("protect", "Clear drains and gutters so water can leave the yard", due, "urgent");
      push("water", "Pause irrigation until the storm passes", ctx.now, "urgent");
      push("check", "Don't fertilize or prune now", ctx.now, "urgent");
      if (warn) push("protect", ctx.balcony ? "Bring in chairs, stakes and anything that could blow off the balcony" : "Secure loose garden items that could fly: chairs, stakes, decor, tools", due, "urgent");
      if (ctx.balcony) push("protect", EMPTY_SAUCERS, after, "normal");
      break;
    }
    case "flood": {
      const due = dueBefore(a, ctx.now, 3, 2);
      push("water", "Pause irrigation", ctx.now, "urgent");
      push("protect", ctx.balcony ? "Move pots back from the edge and off the floor drain" : "Move containers to higher ground", due, "urgent");
      if (!ctx.balcony) push("protect", "Protect low beds: move seedlings and cover low spots if you can do it before the rain", due, "urgent");
      push("fertilize", "Don't fertilize: it would wash into the bay", ctx.now, "urgent");
      push("check", "After the flood: check for standing water around plants", after, "normal");
      break;
    }
    case "heavy_rain": {
      priority = "normal";
      safety = null;
      const due = dueBefore(a, ctx.now, 2, 6);
      push("water", "Pause irrigation, the rain will cover it", ctx.now, "normal");
      push("protect", "Cover seedlings or move small pots under cover", due, "normal");
      push("fertilize", "Postpone any fertilizer for at least 2 days", ctx.now, "normal");
      if (ctx.balcony) push("check", EMPTY_SAUCERS, after, "normal");
      else push("check", "After the rain: check drainage and puddles", after, "normal");
      if (ctx.barrel_gal && ctx.barrel_fill_gal) push("check", `Your rain barrel should fill (about ${Math.round(Math.min(ctx.barrel_gal, ctx.barrel_fill_gal))} gal)`, after, "normal");
      if (ctx.rain_garden_gal) push("check", `Your rain garden can hold about ${Math.round(ctx.rain_garden_gal)} gal of runoff`, after, "normal");
      break;
    }
    case "severe_thunderstorm": {
      const due = dueBefore(a, ctx.now, 1, 1);
      push("protect", ctx.balcony ? BRING_INSIDE : "Bring in pots and light items", due, "urgent");
      push("check", "Nothing else outdoors until the storm passes", ctx.now, "urgent");
      break;
    }
    case "wind": {
      priority = ctx.balcony ? "urgent" : "normal";
      safety = ctx.balcony ? SAFETY_LINE : null;
      const due = dueBefore(a, ctx.now, 3, 4);
      if (ctx.balcony) push("protect", BRING_INSIDE, ctx.now, "urgent");
      push("protect", `Stake tall plants: ${names(ctx.tall, "the tallest plants")}`, due, priority, { plants: ctx.tall });
      if (!ctx.balcony) push("protect", "Move pots against a wall or inside", due, priority);
      break;
    }
    case "freeze": {
      safety = FREEZE_SAFETY;
      const onset = a.onset ?? hours(ctx.now, 8);
      const afternoon = Date.parse(onset) - 5 * 3600e3 > Date.parse(ctx.now) ? hours(onset, -5) : ctx.now;
      const evening = Date.parse(onset) - 1 * 3600e3 > Date.parse(ctx.now) ? hours(onset, -1) : ctx.now;
      push("water", "Water the soil in the afternoon: moist soil holds warmth overnight", afternoon, "urgent");
      push("protect", `Cover tender plants with frost cloth to the ground: ${names(ctx.tender, "tender plants")}`, evening, "urgent", { plants: ctx.tender });
      push("protect", ctx.balcony ? "Bring tender pots inside" : "Move tender pots into the garage or against the house", evening, "urgent");
      push("check", "Remove covers in the morning once it's above 40°F", after, "normal");
      break;
    }
    case "heat": {
      priority = "normal";
      safety = null;
      push("water", `Water edibles early in the morning${ctx.edibles?.length ? `: ${names(ctx.edibles, "edibles")}` : ""}`, ctx.now, "normal", { plants: ctx.edibles });
      push("protect", "Shade seedlings in the afternoon", ctx.now, "normal");
      if (ctx.balcony) push("water", "Check pots morning and evening: they dry out fast", ctx.now, "normal");
      break;
    }
  }
  // Balcony rule: on wind, tropical or severe storm alerts "Bring every pot..." is always first.
  if (ctx.balcony && ["tropical_watch", "tropical_warning", "severe_thunderstorm", "wind"].includes(rule)) {
    const i = t.findIndex((x) => x.title === BRING_INSIDE);
    if (i > 0) t.unshift(...t.splice(i, 1));
  }
  // Every urgent list starts with the safety line.
  if (priority === "urgent" && safety) t.unshift({ kind: "safety", title: safety, due_at: ctx.now, priority: "urgent" });
  return { rule, priority, safety, pauses_water: pausesWater(a.event), blocks_fertilizer: rule !== "heat" && rule !== "freeze", tasks: t };
}

/** Follow-up tasks once an alert ends. */
export function followUpTasks(a: AlertIn, now: string, balcony: boolean): RuleTask[] {
  const rule = ruleFor(a.event);
  if (!rule || rule === "heat") return [];
  const out: RuleTask[] = [];
  const add = (title: string) => out.push({ kind: "followup", title, due_at: now, priority: "normal" });
  if (rule === "freeze") {
    add("Check for cold damage, but don't prune it yet: wait for new growth in spring");
  } else {
    add("Walk the garden: check for damage and broken branches");
    add(balcony ? "Empty saucers and pots with standing water" : "Look for standing water and empty anything holding water (mosquitoes)");
    if (!balcony) add("Straighten leaning young plants and remove broken stems");
  }
  add("Take a photo check-in of any damaged plant");
  return out;
}

/** Sum of the next 24 hourly precipitation values from `now` (mm). */
export function rainNext24h(hourly: { time: string; precip_mm: number }[], now: string): number {
  const t0 = Date.parse(now);
  return hourly.filter((h) => { const t = Date.parse(h.time); return t >= t0 - 3600e3 && t < t0 + 24 * 3600e3; }).reduce((s, h) => s + h.precip_mm, 0);
}
export const isHeavyRain = (hourly: { time: string; precip_mm: number }[], now: string) => rainNext24h(hourly, now) >= HEAVY_RAIN_MM_24H;

/** Dedupe key for an NWS alert version: the same id re-sent with a new `sent` time is an update. */
export const dedupeKey = (externalId: string, sent: string | null | undefined) => `${externalId}|${sent ?? ""}`;

/**
 * Fertilizer tasks that fall inside an active alert (onset to ends) or within 48 h after heavy rain move to two days
 * after the alert ends. Returns the moved tasks (date strings YYYY-MM-DD).
 */
export function moveFertilizer<T extends { id: string; kind: string; due_at: string; detail: string }>(tasks: T[], alerts: { event: string; onset?: string | null; ends?: string | null }[], now: string): { tasks: T[]; moved: string[] } {
  const windows = alerts.filter((a) => ruleFor(a.event) && alertTasks(a, { now, balcony: false })?.blocks_fertilizer).map((a) => {
    const start = (a.onset ?? now).slice(0, 10);
    const endIso = a.ends ?? hours(now, 24);
    const end = ruleFor(a.event) === "heavy_rain" ? hours(endIso, 48) : endIso;
    return { start, end: end.slice(0, 10), event: a.event };
  });
  const moved: string[] = [];
  const out = tasks.map((t) => {
    if (t.kind !== "fertilize") return t;
    const w = windows.find((x) => t.due_at >= x.start && t.due_at <= x.end);
    if (!w) return t;
    moved.push(t.id);
    const d = new Date(w.end + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 2);
    return { ...t, due_at: d.toISOString().slice(0, 10), detail: `${t.detail} Moved because of the ${w.event}.` };
  });
  return { tasks: out, moved };
}
