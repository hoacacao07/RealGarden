/**
 * Task calendar (Phase 11): dated tasks for the next 12 months.
 *   prep     soil test, build/fill bed or work in compost, mulch: before the first planting date
 *   plant    next date in the region's planting window, or back-calculated from a target harvest
 *            (plant_date = harvest_date − days_to_harvest)
 *   fertilize edibles only: at planting and every 6 weeks while producing; any date inside the local restricted
 *            window (data/fertilizer_rules.json) moves to the nearest allowed day
 *   harvest  harvest window from days_to_harvest
 * Calendar tasks are generated on page load (deterministic); Phase 12 adds stored alert tasks.
 */
import rulesJson from "../../data/fertilizer_rules.json";
import type { Plant, Region } from "../types";
import { harvestWindow, inWindow, nextPlantingDate, plantDateForHarvest, windowText } from "./edibles";
import { addDays, monthOf } from "./geo";
import type { SoilPlan } from "./soilplan";

export type TaskKind = "prep" | "plant" | "water" | "fertilize" | "harvest" | "protect" | "check";
export type TaskPriority = "normal" | "urgent";
export type TaskSource = "calendar" | "alert" | "checkin";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  due_at: string; // YYYY-MM-DD
  priority: TaskPriority;
  source: TaskSource;
  done: boolean;
  plant_id?: string;
}

export interface FertRule {
  id: string;
  name: string;
  level: string;
  bbox: [number, number, number, number] | null;
  restricted: [[number, number], [number, number]];
  source_url: string;
  note: string;
  verified: boolean;
}

const RULES = rulesJson.rules as unknown as FertRule[];
const DEFAULT_RULE = rulesJson.default as unknown as FertRule;
const LEVEL_ORDER: Record<string, number> = { city: 0, county: 1 };

/** Most specific rule whose box contains the point (city before county), else the conservative default. */
export function fertRuleFor(lat: number, lon: number, rules: FertRule[] = RULES): FertRule {
  const hits = rules.filter((r) => r.bbox && lat >= r.bbox[0] && lat <= r.bbox[2] && lon >= r.bbox[1] && lon <= r.bbox[3]);
  hits.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));
  return hits[0] ?? DEFAULT_RULE;
}

const md = (iso: string) => Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
const pad = (n: number) => String(n).padStart(2, "0");

/** True if the date falls inside the restricted [month, day] range (same-year range, e.g. Jun 1 to Sep 30). */
export function inRestricted(iso: string, rule: Pick<FertRule, "restricted">): boolean {
  const [[m1, d1], [m2, d2]] = rule.restricted;
  const v = md(iso);
  const a = m1 * 100 + d1;
  const b = m2 * 100 + d2;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

/**
 * Move a date out of the restricted window to the nearest allowed day (the day before it starts or the day after it ends).
 * `notBefore` rules out moving earlier than e.g. the planting date.
 */
export function moveOutOfRestricted(iso: string, rule: Pick<FertRule, "restricted">, notBefore?: string): { date: string; moved: boolean } {
  if (!inRestricted(iso, rule)) return { date: iso, moved: false };
  const y = Number(iso.slice(0, 4));
  const [[m1, d1], [m2, d2]] = rule.restricted;
  const start = `${y}-${pad(m1)}-${pad(d1)}`;
  const end = `${y}-${pad(m2)}-${pad(d2)}`;
  const before = addDays(start, -1);
  const after = addDays(end, 1);
  const dist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));
  const early = notBefore != null && before < notBefore;
  return { date: !early && dist(iso, before) <= dist(iso, after) ? before : after, moved: true };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const human = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
export const restrictedText = (r: Pick<FertRule, "restricted">) =>
  `${MON[r.restricted[0][0] - 1]} ${r.restricted[0][1]} to ${MON[r.restricted[1][0] - 1]} ${r.restricted[1][1]}`;

export interface CropPlan {
  plant: Plant;
  count: number;
  plant_on: string;
  in_window: boolean;
  harvest: { start: string; end: string };
  from_target: boolean;
}

/**
 * Planting date per crop, in order of preference:
 *   1. back-calculated from the target harvest when one is set
 *   2. the placement's own planting date (planned or already planted) while its harvest has not ended
 *   3. the next date in the region's window, at least 2 weeks out so there is time to prepare
 */
export function planCrops(
  crops: { plant: Plant; count: number; planted_on?: string | null }[], region: Region, today: string, targetHarvest: string | null,
): CropPlan[] {
  const earliest = addDays(today, 14);
  return crops.flatMap((c) => {
    const { plant, count } = c;
    const e = plant.edible;
    if (!e) return [];
    const windows = e.planting_windows[region];
    let plant_on: string | null;
    let in_window = true;
    let from_target = false;
    if (targetHarvest) {
      const b = plantDateForHarvest(e, targetHarvest, windows);
      plant_on = b.date < earliest ? earliest : b.date;
      in_window = b.in_window;
      from_target = true;
    } else if (c.planted_on && harvestWindow(e, c.planted_on).end >= today) {
      plant_on = c.planted_on;
      in_window = inWindow(monthOf(c.planted_on), windows);
    } else {
      plant_on = nextPlantingDate(windows, earliest);
    }
    if (!plant_on) return [];
    return [{ plant, count, plant_on, in_window, harvest: harvestWindow(e, plant_on), from_target }];
  });
}

export interface CalendarInput {
  today: string;
  region: Region;
  crops: CropPlan[];
  soil: SoilPlan[];
  rule: FertRule;
  hasLandscape: boolean;
  /** Phase 11.7 links: rain barrel and compost bin from the Sustainable section. */
  eco?: { barrel: boolean; compost: boolean };
}

export const FERTILIZE_EVERY_DAYS = 42;
/** Same-day order: checks and prep first, harvest last. */
const KIND_ORDER: TaskKind[] = ["protect", "check", "prep", "plant", "water", "fertilize", "harvest"];

export function taskCalendar(x: CalendarInput): Task[] {
  const tasks: Task[] = [];
  const end = addDays(x.today, 365);
  const add = (t: Omit<Task, "priority" | "source" | "done"> & { priority?: TaskPriority }) =>
    tasks.push({ priority: "normal", source: "calendar", done: false, ...t });

  const first = x.crops.map((c) => c.plant_on).sort()[0] ?? addDays(x.today, 21);
  const edible = x.soil.find((s) => s.zone_kind === "edible");
  const prepBy = (days: number) => {
    const d = addDays(first, -days);
    return d < x.today ? x.today : d;
  };

  add({ id: "prep:ordinance", kind: "check", due_at: x.today, title: "Check your local fertilizer ordinance",
    detail: `${x.rule.name}: no fertilizer ${restrictedText(x.rule)}. ${x.rule.note}` });
  if (edible && edible.decision !== "potting_mix") {
    add({ id: "prep:soil-test", kind: "prep", due_at: prepBy(21), title: "Test the soil pH",
      detail: "A home kit gives a rough number; the UF/IFAS Extension Soil Testing Laboratory gives a reliable one." });
  }
  if (edible?.decision === "raised_bed") {
    add({ id: "prep:build-bed", kind: "prep", due_at: prepBy(14), title: "Build the raised bed", detail: "Untreated boards or blocks on a level, sunny spot." });
    add({ id: "prep:fill-bed", kind: "prep", due_at: prepBy(10), title: "Fill the raised bed", detail: "Raised-bed soil or a 1:1:1 mix of compost, peat moss and vermiculite. See the shopping list." });
  } else if (edible?.decision === "in_ground_compost") {
    add({ id: "prep:compost", kind: "prep", due_at: prepBy(10), title: "Work compost into the vegetable bed", detail: "1 to 4 in of compost into the top 6 in." });
  } else if (edible?.decision === "potting_mix") {
    add({ id: "prep:pots", kind: "prep", due_at: prepBy(7), title: "Fill containers with potting mix", detail: "Bagged potting mix only, never garden soil. Pots need drainage holes." });
  }
  if (x.hasLandscape) {
    add({ id: "prep:mulch", kind: "prep", due_at: prepBy(7), title: "Mulch the native beds 2 to 3 in", detail: "Keep mulch a few inches away from stems. Natives need no fertilizer." });
  }

  for (const c of x.crops) {
    const e = c.plant.edible!;
    const name = c.plant.common_name;
    const lname = name.toLowerCase();
    add({
      id: `plant:${c.plant.id}`, kind: "plant", due_at: c.plant_on, plant_id: c.plant.id,
      title: `Plant ${lname}${c.count > 1 ? ` (${c.count})` : ""}`,
      detail: (c.from_target
        ? `Back-calculated: ${e.days_to_harvest[1]} days before your target harvest.`
        : `In the ${x.region} Florida planting window (${windowText(e.planting_windows[x.region])}).`) +
        (c.in_window ? "" : " Outside the usual planting window, so expect a weaker crop.") +
        (e.needs_staking ? " Put stakes or a cage in at planting." : ""),
    });
    add({ id: `water:${c.plant.id}`, kind: "water", due_at: c.plant_on, plant_id: c.plant.id,
      title: `Water new ${lname} daily for the first week`, detail: "Then follow the watering plan on the dashboard." });

    // Fertilizer: at planting, then every 6 weeks until the harvest ends, moved out of the restricted window.
    const seen = new Set<string>();
    for (let d = c.plant_on, i = 0; d <= c.harvest.end && i < 6; d = addDays(d, FERTILIZE_EVERY_DAYS), i++) {
      const m = moveOutOfRestricted(d, x.rule, c.plant_on);
      if (m.date > c.harvest.end || seen.has(m.date)) continue;
      seen.add(m.date);
      add({
        id: `fert:${c.plant.id}:${i}`, kind: "fertilize", due_at: m.date, plant_id: c.plant.id,
        title: i === 0 ? `Mix slow-release fertilizer in for ${lname}` : `Feed ${lname} (slow-release)`,
        detail: (i === 0 ? "Into the top 6 in at planting. " : "") + "Follow the product label and UF/IFAS guidance." +
          (m.moved ? ` Moved from ${human(d)}: ${x.rule.name} restricts fertilizer ${restrictedText(x.rule)}.` : ""),
      });
    }
    add({
      id: `harvest:${c.plant.id}`, kind: "harvest", due_at: c.harvest.start, plant_id: c.plant.id,
      title: `Start harvesting ${lname}`, detail: `Harvest window about ${human(c.harvest.start)} to ${human(c.harvest.end)} (${e.days_to_harvest[0]} to ${e.days_to_harvest[1]} days from planting).`,
    });
  }

  // Sustainable section links (spec 6D.6): barrel cleaning before mosquito season, yearly mulch, compost turning.
  const nextOn = (m: number, d: number) => {
    const y = Number(x.today.slice(0, 4));
    const iso = (yy: number) => `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return iso(y) >= x.today ? iso(y) : iso(y + 1);
  };
  if (x.eco?.barrel) {
    add({ id: "eco:barrel", kind: "check", due_at: nextOn(4, 15), title: "Empty and scrub the rain barrel", detail: "Before mosquito season: check the screen and lid so mosquitoes can't breed. Use barrel water first in dry spells." });
  }
  if (x.hasLandscape) add({ id: "eco:mulch", kind: "prep", due_at: nextOn(2, 1), title: "Top up mulch to 2 to 3 in", detail: "Once a year. Mulch holds water and keeps fertilizer out of runoff." });
  if (x.eco?.compost) {
    for (let i = 0; i < 6; i++) add({ id: `eco:compost:${i}`, kind: "prep", due_at: addDays(x.today, 7 + i * 30), title: "Turn the compost", detail: "Mix it and keep it as damp as a wrung-out sponge." });
  }

  return tasks.filter((t) => t.due_at >= x.today && t.due_at <= end)
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
}
