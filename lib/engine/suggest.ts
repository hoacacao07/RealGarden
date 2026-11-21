/**
 * Suggestion engine (Phase 11.6, spec 6C.4). Rules first, AI second.
 *   1. Context: ZIP → lat/lon, region, USDA zone, soil, coast distance (done by the caller).
 *   2. Hard filters: invasive (FISC I/II), region, zone (perennials: winter low vs cold hardiness), winter chill for
 *      fruit, light, salt near the coast, pots only on balconies (and container-only plants like mint never go in the
 *      ground), season (vegetables and herbs only if their planting window opens within 8 weeks).
 *   3. Score: S = S_site × S_theme × S_goal × N
 *        S_site  existing site score (light, salt, water, region, space, soil pH) from recommend.ts
 *        S_theme 1 core pool member, 0.85 tag match, 0.35 otherwise (1 when no theme is chosen); best theme wins
 *        S_goal  low-care favors low water; heavy feeders × 0.7 for users with about 1 hour a week
 *        N       1 when prefer_natives is off; on: 1.0 for natives, 0.8 (some) or 0.6 (mostly) for non-natives
 *   4. AI pass (lib/ai/suggest.ts): Gemini picks a balanced set from the top 30 candidates only.
 * Pure and deterministic.
 */
import themesJson from "../../data/themes.json";
import { feedingOf, friendlyLine, groupOf, isBlocked, isNative, lifeCycleOf } from "../catalog";
import type { Goal, HoursWeek, Plant, PlantGroup, PreferNatives, SiteInput } from "../types";
import { nextPlantingDate } from "./edibles";
import { addDays } from "./geo";
import { scorePlant } from "./recommend";
import { chillHoursFor, zoneMinF } from "./zone";

export interface ThemeDef {
  id: string;
  name: string;
  emoji: string;
  colors: string[];
  description: string;
  pools: Record<string, string[]>;
  tags?: { wildlife?: string[]; water_need?: string[]; container_ok?: boolean[] };
  layout: "border_beds" | "raised_bed" | "orchard" | "containers";
  groups: PlantGroup[];
  light?: string[];
  calendar_hints: string[];
  balcony?: boolean;
}

export const THEMES = themesJson.themes as unknown as ThemeDef[];
export const themeById = (id: string) => THEMES.find((t) => t.id === id);

export interface SuggestCtx {
  site: SiteInput;
  zone: string;
  themes: string[];
  goals?: Goal[];
  prefer_natives: PreferNatives;
  hours_week?: HoursWeek | null;
  today: string; // YYYY-MM-DD
}

export interface Suggestion {
  plant: Plant;
  score: number;
  terms: { site: number; theme: number; goal: number; native: number };
  theme: string | null;
  role: string | null;
  reasons: string[];
  when: { now: boolean; date: string | null; label: string };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SEASON_WEEKS = 8;
/** Zone margin: a perennial is excluded when the zone's winter low is more than 5°F below its cold hardiness. */
const ZONE_MARGIN_F = 5;

export const NATIVE_WEIGHT: Record<PreferNatives, number> = { off: 1, some: 0.8, mostly: 0.6 };
export function nativeWeight(p: Plant, pref: PreferNatives): number {
  if (pref === "off" || isNative(p)) return 1;
  return NATIVE_WEIGHT[pref];
}

const hasWindows = (p: Plant) => !!p.edible?.planting_windows;

/** "Plant now" (window open within 2 weeks), "Plant in March", or the perennial default (plant now). */
export function plantWhen(p: Plant, site: SiteInput, today: string): Suggestion["when"] {
  if (!hasWindows(p)) return { now: true, date: today, label: "Plant now" };
  const d = nextPlantingDate(p.edible!.planting_windows[site.region] ?? [], today);
  if (!d) return { now: false, date: null, label: "Not this year" };
  if (d <= addDays(today, 14)) return { now: true, date: d, label: "Plant now" };
  return { now: false, date: d, label: `Plant in ${MONTHS[Number(d.slice(5, 7)) - 1]}` };
}

/** Hard filters. Returns the reason a plant is out, or null. */
export function hardFilter(p: Plant, ctx: SuggestCtx): string | null {
  const { site } = ctx;
  if (isBlocked(p)) return "Invasive in Florida";
  if (!p.regions.includes(site.region)) return `Doesn't grow well in ${site.region} Florida`;
  if (lifeCycleOf(p) !== "annual" && zoneMinF(ctx.zone) + ZONE_MARGIN_F < p.cold_hardy_f) return `Too cold in winter for it (zone ${ctx.zone})`;
  if (p.zones?.length && lifeCycleOf(p) !== "annual" && !p.zones.includes(ctx.zone)) return `Not suited to zone ${ctx.zone}`;
  if (p.chill_hours != null && p.chill_hours > chillHoursFor(ctx.zone) + 50) return "Needs more winter chill than you get here";
  if (site.coastal_distance_mi < 0.5 && p.salt_tolerance === "low") return "Salt-sensitive this close to the coast";
  const balcony = site.kind === "balcony";
  if (balcony && !p.container_ok) return "Doesn't do well in a pot";
  if (hasWindows(p)) {
    const d = nextPlantingDate(p.edible!.planting_windows[site.region] ?? [], ctx.today);
    if (!d || d > addDays(ctx.today, SEASON_WEEKS * 7)) return "Out of season: its planting window is more than 8 weeks away";
  }
  return null;
}

/** Best theme fit across the chosen themes. */
export function themeTerm(p: Plant, themes: string[]): { value: number; theme: string | null; role: string | null } {
  if (!themes.length) return { value: 1, theme: null, role: null };
  let best = { value: 0.35, theme: null as string | null, role: null as string | null };
  for (const id of themes) {
    const t = themeById(id);
    if (!t) continue;
    for (const [role, ids] of Object.entries(t.pools)) if (ids.includes(p.id)) return { value: 1, theme: t.id, role };
    const tag = t.tags;
    const tagHit = (tag?.wildlife && p.wildlife_value.some((w) => tag.wildlife!.includes(w)))
      || (tag?.water_need && tag.water_need.includes(p.water_need))
      || (tag?.container_ok && !!p.container_ok);
    if (tagHit && t.groups.includes(groupOf(p)) && best.value < 0.85) best = { value: 0.85, theme: t.id, role: null };
  }
  return best;
}

export function goalTerm(p: Plant, ctx: Pick<SuggestCtx, "goals" | "hours_week">): number {
  let g = 1;
  const goals = ctx.goals ?? [];
  if (goals.includes("low_care")) g *= p.water_need === "low" ? 1 : p.water_need === "medium" ? 0.85 : 0.6;
  if (goals.includes("butterflies") && (p.host_plant_for.length || p.wildlife_value.includes("butterflies"))) g *= 1.1;
  if (goals.includes("food") && (p.edible || groupOf(p) === "fruit")) g *= 1.1;
  if (goals.includes("flowers") && p.flower_colors.length && p.bloom_months.length >= 4) g *= 1.05;
  if (ctx.hours_week === "1" && feedingOf(p) === "heavy") g *= 0.7;
  return Math.min(1.2, g);
}

function friendlyReason(p: Plant, s: Pick<Suggestion, "theme" | "role">, ctx: SuggestCtx, siteReasons: string[]): string[] {
  const r: string[] = [friendlyLine(p)];
  const t = s.theme ? themeById(s.theme) : null;
  if (t) r.push(`Fits your ${t.name.toLowerCase()} style`);
  if (ctx.prefer_natives !== "off" && isNative(p)) r.push("Florida native");
  if (p.fl_notes) r.push(p.fl_notes.split(/(?<=\.)\s/)[0]);
  r.push(...siteReasons);
  return [...new Set(r)].slice(0, 4);
}

/** All plants that pass the filters, scored and ranked. `excluded` lists the rest with reasons (for "Why not"). */
export function suggest(plants: Plant[], ctx: SuggestCtx): { ranked: Suggestion[]; excluded: { plant: Plant; reason: string }[] } {
  const ranked: Suggestion[] = [];
  const excluded: { plant: Plant; reason: string }[] = [];
  const themes = ctx.themes.filter((t) => themeById(t));
  const wantGroups = new Set(themes.flatMap((t) => themeById(t)!.groups));
  for (const p of plants) {
    const hard = hardFilter(p, ctx);
    if (hard) { excluded.push({ plant: p, reason: hard }); continue; }
    if (ctx.site.kind !== "balcony" && p.container_only && !themes.includes("balcony") && !themes.includes("herb")) { excluded.push({ plant: p, reason: "Only grows well in a pot" }); continue; }
    const site = scorePlant(ctx.site, p);
    if (site.excluded) { excluded.push({ plant: p, reason: site.excluded }); continue; }
    if (site.terms.light === 0) { excluded.push({ plant: p, reason: "Not enough (or too much) sun here" }); continue; }
    const th = themeTerm(p, themes);
    // With themes chosen, plants outside every theme's groups stay out unless they're a core pick.
    if (themes.length && th.value < 1 && !wantGroups.has(groupOf(p))) { excluded.push({ plant: p, reason: "Doesn't fit the styles you picked" }); continue; }
    const terms = { site: site.score, theme: th.value, goal: goalTerm(p, ctx), native: nativeWeight(p, ctx.prefer_natives) };
    const score = Math.round(terms.site * terms.theme * terms.goal * terms.native * 1000) / 1000;
    const s = { theme: th.theme, role: th.role };
    ranked.push({ plant: p, score, terms, ...s, reasons: friendlyReason(p, s, ctx, site.reasons), when: plantWhen(p, ctx.site, ctx.today) });
  }
  ranked.sort((a, b) => b.score - a.score || a.plant.common_name.localeCompare(b.plant.common_name));
  return { ranked, excluded };
}

// ---------------------------------------------------------------- picks

export interface PlantPick { plant_id: string; qty: number; reason: string }

/** Rejects AI output with plant ids that were not in the candidate list, duplicates, or silly quantities. */
export function validatePicks(picks: PlantPick[], candidateIds: Set<string>): PlantPick[] {
  if (!picks.length) throw new Error("no picks");
  const seen = new Set<string>();
  for (const p of picks) {
    if (!candidateIds.has(p.plant_id)) throw new Error(`unknown plant id ${p.plant_id}`);
    if (seen.has(p.plant_id)) throw new Error(`duplicate plant id ${p.plant_id}`);
    seen.add(p.plant_id);
    if (!Number.isInteger(p.qty) || p.qty < 1 || p.qty > 12) throw new Error(`bad qty for ${p.plant_id}`);
  }
  return picks;
}

/** How many of a plant fit: by spread vs the space (pots: 1 or 2 each). */
export function defaultQty(p: Plant, site: SiteInput): number {
  if (site.kind === "balcony") return p.id.includes("tomato") ? 2 : 1;
  const spread = (p.mature_spread_ft[0] + p.mature_spread_ft[1]) / 2;
  if (spread >= 8) return 1;
  if (groupOf(p) === "vegetable" || groupOf(p) === "herb") return Math.min(6, Math.max(2, Math.round(6 / Math.max(0.5, spread))));
  return spread < 2 ? 3 : spread < 5 ? 2 : 1;
}

/**
 * Rule-based picks (also the fallback when Gemini fails): top scores, at most 2 per theme role and 3 per group,
 * small yards get fewer species. Every chosen theme gets at least one plant when possible.
 */
export function rulePicks(ranked: Suggestion[], ctx: SuggestCtx, max?: number): PlantPick[] {
  const n = max ?? (ctx.site.kind === "balcony" ? 6 : ctx.site.area_sqft < 250 ? 6 : ctx.hours_week === "1" ? 6 : 9);
  const out: Suggestion[] = [];
  const perRole = new Map<string, number>();
  const perGroup = new Map<string, number>();
  const add = (s: Suggestion) => {
    const role = `${s.theme}:${s.role}`;
    const g = groupOf(s.plant);
    if (out.includes(s) || (perRole.get(role) ?? 0) >= 2 || (perGroup.get(g) ?? 0) >= 4) return false;
    if (ctx.site.kind !== "balcony" && ctx.site.area_sqft < 600 && s.plant.mature_spread_ft[1] > 15) return false;
    out.push(s);
    perRole.set(role, (perRole.get(role) ?? 0) + 1);
    perGroup.set(g, (perGroup.get(g) ?? 0) + 1);
    return true;
  };
  // Round-robin over each chosen theme's roles in order (roses before cut flowers, hosts before nectar), so every
  // style shows its signature plants; then fill with the best remaining scores.
  const roles = ctx.themes.flatMap((t) => Object.keys(themeById(t)?.pools ?? {}).map((role) => [t, role] as const));
  for (const [t, role] of roles) {
    if (out.length >= n) break;
    const best = ranked.find((s) => s.theme === t && s.role === role && !out.includes(s));
    if (best) add(best);
  }
  for (const s of ranked) {
    if (out.length >= n) break;
    add(s);
  }
  return out.slice(0, n).map((s) => ({ plant_id: s.plant.id, qty: defaultQty(s.plant, ctx.site), reason: s.reasons[0] ?? "Fits your yard" }));
}
