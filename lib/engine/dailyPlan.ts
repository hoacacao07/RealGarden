/**
 * Daily Care Plan engine (Phase 12.5, spec 7D). Pure functions, no I/O. The engine decides the limits for every plant
 * group and day; Gemini (lib/dailyPlan.ts) only chooses and words actions inside them, and validatePlan() enforces them.
 *
 * Rain counted toward the soil for a day (spec 7D.3)
 *   counted = Σ_h r_h × w(p_h),   w = 1 if p ≥ 60 %, 0.5 if 30..59 %, 0 below 30 %
 *   counted < 2 mm → 0;   effective = 0.8 × counted
 * Root depth while establishing
 *   Zr(t) = Zr_min + (Zr_max − Zr_min) × min(1, age_days / establish_days)
 * Soil water (in-ground and raised beds, mm)
 *   TAW = 1000 × θ_avail × Zr (m),  RAW = p × TAW  (p lower for thirsty stages)
 *   D_r,t = clamp(D_r,t−1 + Kc_stage × ET0 − effective rain − irrigation, 0, TAW)
 * Pots use the container model (6B.4) in liters: capacity = V × θ_mix, use = Kc × ET0 × wall × canopy, rain only if open.
 * Limits for day d
 *   must_not_water  D_start < 0.2 × TAW, or counted rain today ≥ D_start, or an active flood / heavy rain / storm alert
 *   must_water      D_end (no watering) > RAW and rain before noon < D_start
 *   optional        everything else
 * Amount when watering (refill the root zone)
 *   gallons = D_r (mm) × A_root (ft²) × 0.0245 / efficiency,  A_root = 1.5 × canopy;  bounds = [0.7, 1.1] × gallons
 */
import type { Plant } from "../types";
import { addDays, monthOf } from "./geo";
import { stageKc as edibleKc } from "./edibles";

export const PLAN_CONFIG = {
  _note: "Estimates to verify. Rain weights, thresholds, root depths, mix water and efficiencies are planning values.",
  rain_weight: [{ min_prob: 60, w: 1 }, { min_prob: 30, w: 0.5 }],
  rain_min_mm: 2,
  rain_effective: 0.8,
  zr_min_in: 6,
  wet_fraction: 0.2, // soil still wet below 0.2 × TAW
  p_default: 0.5,
  p_thirsty: 0.4, // flowering, fruiting, harvest
  p_new: 0.35, // just planted
  establishing_kc: 1.3,
  root_area_factor: 1.5, // A_root = 1.5 × canopy
  gal_per_mm_sqft: 0.0245,
  efficiency: { drip: 0.9, spray: 0.7, none: 0.8 } as Record<string, number>,
  amount_bounds: [0.7, 1.1] as [number, number],
  mix_theta: 0.2, // raised-bed mix available water fraction
  pot_theta: 0.25,
  hot_wall_factor: 1.2,
  hot_day_f: 88,
  heat_day_f: 93,
  frost_margin_f: 3,
  windy_mph: 35,
  can_gal: 2, // default watering can
  cups_per_gal: 16,
} as const;

export type Stage = "just_planted" | "establishing" | "growing" | "flowering" | "fruiting" | "harvest" | "resting";
export const STAGES: Stage[] = ["just_planted", "establishing", "growing", "flowering", "fruiting", "harvest", "resting"];
export const STAGE_LABEL: Record<Stage, string> = {
  just_planted: "Just planted", establishing: "Settling in", growing: "Growing", flowering: "Flowering", fruiting: "Fruiting", harvest: "Ready to pick", resting: "Resting",
};

export const ACTION_TYPES = ["water", "skip_water", "check_soil", "protect", "harvest", "pollinate", "feed", "observe", "photo"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
export type When = "early_morning" | "morning" | "midday" | "afternoon" | "evening" | "any";
export interface Amount { value: number; unit: "gal" | "cups" | "cans" | "L" }
export interface PlanAction { type: ActionType; when?: When; amount?: Amount; how?: string; what?: string }

// ---------------------------------------------------------------- weather facts

export interface HourWx { time: string; precip_mm: number; prob_pct: number; temp_f: number; rh_pct: number; gust_mph: number } // time "YYYY-MM-DDTHH:00" local
export interface DayWx { date: string; et0_mm: number; tmax_f: number; tmin_f: number; uv_max: number }

export interface AlertFlag { event: string; kind: "storm" | "flood_rain" | "freeze" | "heat" | "wind"; onset: string | null; ends: string | null }

export interface DayFacts {
  date: string;
  et0_mm: number;
  tmax_f: number;
  tmin_f: number;
  uv_max: number;
  max_gust_mph: number;
  raw_rain_mm: number;
  counted_mm: number;
  effective_mm: number;
  before_noon_mm: number; // counted rain before 12:00
  rain_hours: number[]; // local hours with likely rain (weight > 0, ≥ 0.2 mm)
  max_prob: number;
  alerts: AlertFlag["kind"][];
  alert_events: string[];
}

export function rainWeight(prob: number): number {
  for (const r of PLAN_CONFIG.rain_weight) if (prob >= r.min_prob) return r.w;
  return 0;
}

/** Counted rain for one day of hours (spec 7D.3). */
export function countRain(hours: Pick<HourWx, "time" | "precip_mm" | "prob_pct">[]) {
  let counted = 0;
  let beforeNoon = 0;
  let raw = 0;
  const rainHours: number[] = [];
  for (const h of hours) {
    const w = rainWeight(h.prob_pct);
    raw += h.precip_mm;
    counted += h.precip_mm * w;
    const hr = Number(h.time.slice(11, 13));
    if (hr < 12) beforeNoon += h.precip_mm * w;
    if (w > 0 && h.precip_mm >= 0.2) rainHours.push(hr);
  }
  if (counted < PLAN_CONFIG.rain_min_mm) counted = 0;
  if (beforeNoon < PLAN_CONFIG.rain_min_mm) beforeNoon = 0;
  return { raw_mm: raw, counted_mm: counted, effective_mm: PLAN_CONFIG.rain_effective * counted, before_noon_mm: beforeNoon, rain_hours: rainHours };
}

const overlapsDay = (a: AlertFlag, date: string) => {
  const s = a.onset ? a.onset.slice(0, 10) : "0000-00-00";
  const e = a.ends ? a.ends.slice(0, 10) : "9999-99-99";
  return s <= date && date <= e;
};

/** Group hourly weather into days and attach alerts that cover each day. */
export function dayFacts(days: DayWx[], hours: HourWx[], alerts: AlertFlag[] = []): DayFacts[] {
  return days.map((d) => {
    const hs = hours.filter((h) => h.time.slice(0, 10) === d.date);
    const r = countRain(hs);
    const on = alerts.filter((a) => overlapsDay(a, d.date));
    return {
      date: d.date, et0_mm: d.et0_mm, tmax_f: d.tmax_f, tmin_f: d.tmin_f, uv_max: d.uv_max,
      max_gust_mph: Math.max(0, ...hs.map((h) => h.gust_mph)), raw_rain_mm: r.raw_mm, counted_mm: r.counted_mm, effective_mm: r.effective_mm,
      before_noon_mm: r.before_noon_mm, rain_hours: r.rain_hours, max_prob: Math.max(0, ...hs.map((h) => h.prob_pct)),
      alerts: [...new Set(on.map((a) => a.kind))], alert_events: [...new Set(on.map((a) => a.event))],
    };
  });
}

/** Alert kind from an NWS event name (or "Heavy rain"). */
export function alertKind(event: string): AlertFlag["kind"] | null {
  const e = event.toLowerCase();
  if (/hurricane|tropical|severe thunderstorm/.test(e)) return "storm";
  if (/flood|heavy rain/.test(e)) return "flood_rain";
  if (/freeze|frost/.test(e)) return "freeze";
  if (/heat/.test(e)) return "heat";
  if (/wind/.test(e)) return "wind";
  return null;
}

/** "2026-11-22T03:00:00Z" → "2026-11-21T22:00" in Florida local time (day boundaries match the forecast hours). */
export function localTime(iso: string, timeZone = "America/New_York"): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export interface StoredAlert { event: string; onset: string | Date | null; ends: string | Date | null; active?: boolean }

/** Active alerts (Phase 12: NWS and Open-Meteo heavy rain) → flags the limits understand, with local onset/end. */
export function alertFlags(alerts: StoredAlert[]): AlertFlag[] {
  const iso = (v: string | Date | null) => (v == null ? null : localTime(typeof v === "string" ? v : v.toISOString()));
  const out: AlertFlag[] = [];
  for (const a of alerts) {
    if (a.active === false) continue;
    const kind = alertKind(a.event);
    if (kind) out.push({ event: a.event, kind, onset: iso(a.onset), ends: iso(a.ends) });
  }
  return out;
}

export interface PastWx { date: string; rain_mm: number; et0_mm: number }

/**
 * Past days for the soil replay (spec 7D.3): observed rain from Open-Meteo (past_days=3) plus "It rained here" taps.
 * A tap counts the day as a soaking rain (the replay refills the bucket), so the user's own rain gauge wins over a
 * dry forecast cell. Taps for today are returned separately and applied on top of the morning state.
 */
export function rainHistory(past: PastWx[], rainedTaps: string[], today: string): { hist: HistDay[]; past_logs: LogEvent[]; today_logs: LogEvent[] } {
  const taps = new Set(rainedTaps);
  const hist = past.filter((p) => p.date < today).sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ date: p.date, et0_mm: p.et0_mm, rain_mm: p.rain_mm }));
  const earliest = hist[0]?.date ?? today;
  const past_logs = [...taps].filter((d) => d >= earliest && d < today).sort().map((date) => ({ date, kind: "rained" as const }));
  const today_logs = taps.has(today) ? [{ date: today, kind: "rained" as const }] : [];
  return { hist, past_logs, today_logs };
}

/** Plain summary of the week for the planner input and the 7-day strip icons. */
export function weatherIcon(f: DayFacts): "storm" | "rain" | "showers" | "hot" | "cold" | "sun" {
  if (f.alerts.includes("storm")) return "storm";
  if (f.counted_mm >= 6) return "rain";
  if (f.counted_mm > 0 || (f.max_prob >= 30 && f.raw_rain_mm >= 1)) return "showers";
  if (f.tmax_f >= PLAN_CONFIG.hot_day_f) return "hot";
  if (f.tmin_f <= 45 || f.alerts.includes("freeze")) return "cold";
  return "sun";
}

// ---------------------------------------------------------------- plant state

export function rootDepthIn(zrMinIn: number, zrMaxIn: number, ageDays: number, establishDays: number): number {
  const max = Math.max(zrMinIn, zrMaxIn);
  return zrMinIn + (max - zrMinIn) * Math.min(1, Math.max(0, ageDays) / Math.max(1, establishDays));
}

export const establishDays = (p: Pick<Plant, "edible" | "establishment_months">) =>
  p.edible ? p.edible.kc_stages.stage_days[0] + p.edible.kc_stages.stage_days[1] : Math.max(30, (p.establishment_months || 6) * 30);

export interface StageOverride { stage: Stage; date: string; source: "photo" | "user" }

/** Map the diagnose phenology stage to a plan stage. */
export function stageFromPhoto(s: string): Stage | null {
  return ({ vegetative: "growing", budding: "growing", flowering: "flowering", fruiting: "fruiting", dormant: "resting" } as Record<string, Stage>)[s] ?? null;
}

export interface StageResult { stage: Stage; since: string | null; confidence: "low" | "medium" | "high"; source: "photo" | "user" | "age" | "season" }

/**
 * Growth stage: a recent check-in photo or user tap (last 30 days) wins; otherwise edibles go by days since planting
 * (FAO-56 stage lengths and days to harvest) and ornamentals by age and their bloom and fruit months.
 */
export function growthStage(p: Plant, plantedOn: string, today: string, override?: StageOverride | null): StageResult {
  if (override && override.date <= today && override.date >= addDays(today, -30)) {
    return { stage: override.stage, since: override.date, confidence: "high", source: override.source };
  }
  const age = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(plantedOn + "T12:00:00Z")) / 86400e3);
  if (age < 14) return { stage: "just_planted", since: plantedOn, confidence: "high", source: "age" };
  const est = establishDays(p);
  if (p.edible) {
    const [l1, l2] = p.edible.kc_stages.stage_days;
    const [h0] = p.edible.days_to_harvest;
    const at = (d: number) => addDays(plantedOn, d);
    if (age >= h0) return { stage: "harvest", since: at(h0), confidence: "medium", source: "age" };
    if (age >= h0 - 25) return { stage: "fruiting", since: at(h0 - 25), confidence: "medium", source: "age" };
    if (age >= l1 + l2) return { stage: "flowering", since: at(l1 + l2), confidence: "medium", source: "age" };
    if (age < l1) return { stage: "establishing", since: at(14), confidence: "medium", source: "age" };
    return { stage: "growing", since: at(l1), confidence: "medium", source: "age" };
  }
  if (age < est) return { stage: "establishing", since: addDays(plantedOn, 14), confidence: "medium", source: "age" };
  const m = monthOf(today);
  const first = (months: number[]) => {
    // first day of the current run of months containing m
    let k = m;
    for (let i = 0; i < 12 && months.includes(((k - 2 + 12) % 12) + 1); i++) k = ((k - 2 + 12) % 12) + 1;
    return `${today.slice(0, 4)}-${String(k).padStart(2, "0")}-01` <= today ? `${today.slice(0, 4)}-${String(k).padStart(2, "0")}-01` : `${Number(today.slice(0, 4)) - 1}-${String(k).padStart(2, "0")}-01`;
  };
  if (p.bloom_months.includes(m)) return { stage: "flowering", since: first(p.bloom_months), confidence: "low", source: "season" };
  if (p.fruit_months.includes(m)) return { stage: "fruiting", since: first(p.fruit_months), confidence: "low", source: "season" };
  if ([12, 1, 2].includes(m)) return { stage: "resting", since: null, confidence: "low", source: "season" };
  return { stage: "growing", since: null, confidence: "low", source: "season" };
}

/** Crop coefficient for the stage: FAO-56 curve for edibles, the plant's Kc otherwise (×1.3 while establishing). */
export function kcFor(p: Plant, stage: Stage, ageDays: number): number {
  if (p.edible) return edibleKc(p.edible, ageDays).kc;
  const base = stage === "resting" ? p.kc * 0.7 : p.kc;
  return stage === "just_planted" || stage === "establishing" ? base * PLAN_CONFIG.establishing_kc : base;
}

export const depletionFraction = (stage: Stage) =>
  stage === "just_planted" ? PLAN_CONFIG.p_new : ["flowering", "fruiting", "harvest"].includes(stage) ? PLAN_CONFIG.p_thirsty : PLAN_CONFIG.p_default;

// ---------------------------------------------------------------- water bucket (ground in mm, pot in liters)

export interface Bucket {
  kind: "ground" | "pot";
  capacity: number; // TAW (mm) or AW per pot (L)
  raw: number; // RAW (mm) or refill line (L)
  /** Daily use from ET0 (mm or L). */
  use: (et0: number) => number;
  /** Effective rain gain from counted rain (mm or L). */
  gain: (countedMm: number) => number;
  /** Deficit → gallons to apply (per pot for pots, for the whole group in the ground). */
  toGal: (deficit: number) => number;
}

export interface GroundBucketIn { theta: number; zr_in: number; p: number; kc: number; canopy_sqft: number; irrigation: string; covered?: boolean }
export function groundBucket(x: GroundBucketIn): Bucket {
  const taw = 1000 * x.theta * ((x.zr_in * 25.4) / 1000);
  const eff = PLAN_CONFIG.efficiency[x.irrigation] ?? PLAN_CONFIG.efficiency.none;
  const aRoot = PLAN_CONFIG.root_area_factor * Math.max(1, x.canopy_sqft);
  return {
    kind: "ground", capacity: taw, raw: x.p * taw,
    use: (et0) => x.kc * et0,
    gain: (c) => (x.covered ? 0 : PLAN_CONFIG.rain_effective * c),
    toGal: (mm) => (mm * aRoot * PLAN_CONFIG.gal_per_mm_sqft) / eff,
  };
}

export interface PotBucketIn { gal: number; kc: number; canopy_m2: number; hot_wall: boolean; open: boolean; p: number }
export function potBucket(x: PotBucketIn): Bucket {
  const aw = x.gal * 3.785 * PLAN_CONFIG.pot_theta;
  const diamM = 6.6 * Math.cbrt(Math.max(0.25, x.gal)) * 0.0254;
  const top = Math.PI * (diamM / 2) ** 2;
  return {
    kind: "pot", capacity: aw, raw: Math.max(x.p, 0.5) * aw,
    use: (et0) => x.kc * et0 * (x.hot_wall ? PLAN_CONFIG.hot_wall_factor : 1) * x.canopy_m2,
    gain: (c) => (x.open ? PLAN_CONFIG.rain_effective * c * top : 0),
    toGal: (l) => l / 3.785 / 0.9,
  };
}

// ---------------------------------------------------------------- replay history and log feedback

export interface HistDay { date: string; et0_mm: number; rain_mm: number }
export interface LogEvent { date: string; kind: "watered" | "rained" | "thirsty" | "soggy" | "skipped" }

/**
 * Today's deficit: replay past days assuming the usual plan was followed (refill when the line is crossed), except
 * that logged waterings and "It rained here" refill the bucket, "Looks thirsty" raises the deficit to the line and
 * "Looks soggy" empties it.
 */
export function replayDeficit(b: Bucket, hist: HistDay[], logs: LogEvent[] = []): number {
  let d = 0;
  const logged = new Set(logs.map((l) => l.date));
  for (const h of hist) {
    const mine = logs.filter((l) => l.date === h.date);
    d = Math.min(b.capacity, Math.max(0, d + b.use(h.et0_mm) - b.gain(h.rain_mm < PLAN_CONFIG.rain_min_mm ? 0 : h.rain_mm)));
    if (!logged.has(h.date) && d > b.raw) d = 0; // assumed plan followed
    for (const l of mine) {
      if (l.kind === "watered" || l.kind === "rained" || l.kind === "soggy") d = 0;
      if (l.kind === "thirsty") d = Math.max(d, b.raw);
    }
  }
  return d;
}

/** Feedback from today (after the replay): applied on top of the morning state. */
export function applyToday(b: Bucket, d: number, logs: LogEvent[]): number {
  for (const l of logs) {
    if (l.kind === "watered" || l.kind === "rained" || l.kind === "soggy") d = 0;
    if (l.kind === "thirsty") d = Math.max(d, b.raw * 1.05);
  }
  return d;
}

// ---------------------------------------------------------------- limits

export type DayStatus = "must_water" | "must_not_water" | "optional";
export type LimitWhy = "soil_wet" | "rain_today" | "rain_morning" | "alert" | "storm" | "soggy" | "will_dry" | "fine" | "watered_today";

export interface DayLimit {
  date: string;
  status: DayStatus;
  why: LimitWhy;
  deficit_start: number; // mm or L
  deficit_end: number; // projected end of day with the plan
  fraction_used: number; // deficit_start / capacity
  gal: [number, number] | null; // amount bounds when watering
  gal_mid: number | null;
  when: When; // advised time if watering
  no_evening: boolean;
}

export interface LimitsIn {
  bucket: Bucket;
  deficit_today: number;
  days: DayFacts[];
  disease_prone: boolean;
  /** Days with a "Looks soggy" tap (no watering today and tomorrow). */
  soggy_until?: string | null;
  /** Watering already logged today. */
  watered_today?: boolean;
}

/** The engine's limits for each day (spec 7D.3). Projects the deficit forward assuming must-water days are watered. */
export function dayLimits(x: LimitsIn): DayLimit[] {
  const b = x.bucket;
  let d = x.deficit_today;
  return x.days.map((f, i) => {
    const use = b.use(f.et0_mm);
    const gain = b.gain(f.counted_mm);
    const morningGain = b.gain(f.before_noon_mm);
    const start = d;
    const endNoWater = Math.min(b.capacity, Math.max(0, start + use - gain));
    const stormy = f.alerts.includes("storm");
    const floody = f.alerts.includes("flood_rain");
    let status: DayStatus = "optional";
    let why: LimitWhy = "fine";
    if (stormy) { status = "must_not_water"; why = "storm"; }
    else if (floody) { status = "must_not_water"; why = "alert"; }
    else if (x.soggy_until && f.date <= x.soggy_until) { status = "must_not_water"; why = "soggy"; }
    else if (i === 0 && x.watered_today) { status = "must_not_water"; why = "watered_today"; }
    else if (start < PLAN_CONFIG.wet_fraction * b.capacity) { status = "must_not_water"; why = "soil_wet"; }
    else if (gain >= start && f.counted_mm > 0) { status = "must_not_water"; why = "rain_today"; }
    else if (endNoWater > b.raw && morningGain < start) { status = "must_water"; why = "will_dry"; }
    else if (endNoWater > b.raw) { status = "optional"; why = "rain_morning"; }
    let galMid: number | null = null;
    let gal: [number, number] | null = null;
    if (status !== "must_not_water") {
      const refill = Math.max(start, 0.3 * b.capacity);
      galMid = b.toGal(refill);
      gal = [round2(galMid * PLAN_CONFIG.amount_bounds[0]), round2(galMid * PLAN_CONFIG.amount_bounds[1])];
    }
    // Project: watered on must-water days (refilled in the morning), otherwise not.
    d = status === "must_water" ? Math.min(b.capacity, Math.max(0, use - gain)) : endNoWater;
    const hot = f.tmax_f >= PLAN_CONFIG.hot_day_f;
    return {
      date: f.date, status, why, deficit_start: round2(start), deficit_end: round2(d), fraction_used: round2(start / Math.max(b.capacity, 1e-6)),
      gal, gal_mid: galMid == null ? null : round2(galMid), when: hot ? "early_morning" : "morning", no_evening: x.disease_prone,
    };
  });
}

const round2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- friendly amounts

/** Gallons → the friendliest unit: cups for small pots, watering cans for hand watering, gallons otherwise. */
export function friendlyAmount(gal: number, o: { hand?: boolean; canGal?: number } = {}): Amount {
  const can = o.canGal ?? PLAN_CONFIG.can_gal;
  if (gal < 0.5) return { value: Math.max(1, Math.round(gal * PLAN_CONFIG.cups_per_gal)), unit: "cups" };
  if (o.hand && gal >= can) return { value: Math.round((gal / can) * 2) / 2, unit: "cans" };
  return { value: gal < 3 ? Math.round(gal * 4) / 4 : Math.round(gal), unit: "gal" };
}

export function amountToGal(a: Amount, canGal: number = PLAN_CONFIG.can_gal): number {
  return a.unit === "gal" ? a.value : a.unit === "cups" ? a.value / PLAN_CONFIG.cups_per_gal : a.unit === "cans" ? a.value * canGal : a.value / 3.785;
}

export function amountText(a: Amount): string {
  const v = Number.isInteger(a.value) ? String(a.value) : a.value.toFixed(a.value < 1 ? 2 : 1).replace(/0$/, "");
  if (a.unit === "cups") return `${v} cup${a.value === 1 ? "" : "s"}`;
  if (a.unit === "cans") return `${v} watering can${a.value === 1 ? "" : "s"}`;
  if (a.unit === "L") return `${v} L`;
  return `${v} gal`;
}

// ---------------------------------------------------------------- groups and the rule plan

export interface GroupFacts {
  id: string;
  name: string; // "3 tomatoes in the Tomato bed"
  plant_id: string;
  plant_name: string;
  count: number;
  container: boolean;
  open_to_rain: boolean;
  hand: boolean;
  edible: boolean;
  stage: StageResult;
  kc: number;
  root_in: number;
  frost_f: number; // cover below this
  disease_prone: boolean;
  harvest_now: boolean;
  wind_sensitive: boolean;
  balcony: boolean;
}

export interface PlanEntry {
  date: string;
  plant_group_id: string;
  actions: PlanAction[];
  reason: string;
  confidence: "low" | "medium" | "high";
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dowName = (iso: string) => DOW[new Date(iso + "T12:00:00Z").getUTCDay()];
const inches = (mm: number) => (mm / 25.4 < 0.1 ? "a little" : `about ${(mm / 25.4).toFixed(1)} in`);
const hourText = (h: number) => (h === 0 ? "midnight" : h < 12 ? `${h} AM` : h === 12 ? "noon" : `${h - 12} PM`);
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function rainLine(f: DayFacts): string | null {
  if (f.counted_mm <= 0) return f.max_prob >= 30 && f.raw_rain_mm >= 1 ? `A small chance of showers (${f.max_prob}%)` : null;
  const start = f.rain_hours.length ? Math.min(...f.rain_hours) : null;
  return `Rain likely${start != null ? ` after ${hourText(start)}` : ""} (${inches(f.counted_mm)})`;
}

/** Actions the alerts and the weather require (added by the validator if Gemini leaves them out). */
export function requiredActions(g: GroupFacts, f: DayFacts): PlanAction[] {
  const out: PlanAction[] = [];
  if (f.alerts.includes("storm") || (g.balcony && f.alerts.includes("wind"))) {
    out.push(g.container || g.balcony
      ? { type: "protect", when: "morning", what: "Bring the pot inside before the wind starts" }
      : { type: "protect", when: "morning", what: g.wind_sensitive ? "Stake or tie the tall stems before the storm" : "Clear loose items around the bed before the storm" });
  }
  if (f.tmin_f <= g.frost_f || f.alerts.includes("freeze")) {
    out.push({ type: "protect", when: "evening", what: g.container ? "Move the pot inside or against the wall for the cold night" : "Cover with frost cloth before dark, uncover in the morning" });
  }
  if (g.container && !g.balcony && f.max_gust_mph >= PLAN_CONFIG.windy_mph && !out.length) {
    out.push({ type: "protect", when: "morning", what: "Move the pot out of the wind" });
  }
  return out;
}

const stageWords = (s: Stage) => ({
  just_planted: "were just planted and need steady water to settle in", establishing: "are still settling in", growing: "are growing",
  flowering: "are flowering and need steady water", fruiting: "are setting fruit and need even water", harvest: "are producing", resting: "are resting and need less water",
}[s]);

/** Rule-only plan (fallback, and the template reasons). Same structure as the Gemini plan. */
export function ruleEntry(g: GroupFacts, f: DayFacts, l: DayLimit, dayIndex: number): PlanEntry {
  const actions: PlanAction[] = [...requiredActions(g, f)];
  const rain = rainLine(f);
  let reason: string;
  const hot = f.tmax_f >= PLAN_CONFIG.hot_day_f;
  const weather = hot ? `a hot day (${Math.round(f.tmax_f)}°F)` : f.tmax_f <= 72 ? `a cool day (${Math.round(f.tmax_f)}°F)` : `a mild day (${Math.round(f.tmax_f)}°F)`;
  const name = lc(g.plant_name);
  if (l.status === "must_water") {
    actions.unshift({ type: "water", when: l.when, amount: friendlyAmount(l.gal_mid ?? 0, { hand: g.hand }), how: g.container ? (g.count > 1 ? "each pot, until water runs out the bottom" : "until water runs out the bottom") : "at the base" });
    reason = `Your ${name} ${stageWords(g.stage.stage)}, and it's ${weather}${rain ? ` with ${lc(rain)}, not enough` : " with no rain"} to keep the ${g.container ? "pot" : "soil"} moist.`;
  } else if (l.status === "must_not_water") {
    actions.unshift({ type: "skip_water" });
    reason = {
      storm: "A storm alert is active: no watering, get things ready before the wind.",
      alert: "A flood or heavy rain alert is active, so the soil will get more than enough.",
      soggy: "You said it looks soggy, so let it dry out before the next watering.",
      watered_today: "Already watered today.",
      soil_wet: `The ${g.container ? "pot" : "soil"} is still moist${dayIndex > 0 ? " from the last watering or rain" : ""}, so skip watering.`,
      rain_today: `${rain ?? "Rain is likely"}, enough to soak the ${g.container ? "pot" : "bed"}.`,
      rain_morning: "", will_dry: "", fine: "",
    }[l.why] || "Skip watering today.";
    if (g.container && !g.open_to_rain && l.why === "rain_today") reason = `${rain ?? "Rain is likely"}, but the pot is under cover: check the soil.`;
  } else {
    actions.unshift({ type: "check_soil", what: "water if the top inch is dry" });
    reason = l.why === "rain_morning"
      ? `${rain ?? "Morning rain"} may be enough. Check the soil in the afternoon.`
      : `The ${g.container ? "pot" : "soil"} should still have water on ${weather}. A quick finger test tells you for sure.`;
  }
  if (g.harvest_now && !f.alerts.includes("storm") && dayIndex % 2 === 0) actions.push({ type: "harvest", when: "morning", what: `ripe ${name}` });
  if (g.stage.stage === "flowering" && dayIndex === 1) actions.push({ type: "observe", what: "new flowers and any pests under the leaves" });
  if (g.stage.confidence === "low" && dayIndex === 0 && g.edible) actions.push({ type: "photo", what: "a quick photo so we know how it's growing" });
  const dedup = actions.filter((a, i) => actions.findIndex((b) => b.type === a.type && b.what === a.what) === i);
  return { date: f.date, plant_group_id: g.id, actions: dedup, reason, confidence: g.stage.confidence === "high" ? "high" : "medium" };
}

export function rulePlan(groups: { g: GroupFacts; limits: DayLimit[] }[], days: DayFacts[]): PlanEntry[] {
  return groups.flatMap(({ g, limits }) => days.map((f, i) => ruleEntry(g, f, limits[i], i)));
}

// ---------------------------------------------------------------- validator

export interface FeedRule { restricted_today: boolean }

export interface Correction { plant_group_id: string; date: string; fix: string }

const FORBIDDEN = /\b(ph|soil test|lime|sulfur|sulphur)\b/i;

/**
 * Enforce the engine's limits on a Gemini plan (spec 7D.4): drop unknown action types, clamp water amounts to the bounds,
 * replace water with skip_water on must-not-water days, add water on must-water days, add required alert/weather actions,
 * allow feed only on edibles outside fertilizer limits, keep reasons short and free of pH / soil test talk.
 * Missing entries are filled from the rule plan. Returns the corrected plan and the list of corrections.
 */
export function validatePlan(
  ai: { date: string; plant_group_id: string; actions: { type: string; when?: string; amount?: { value: number; unit: string }; how?: string; what?: string }[]; reason: string; confidence?: string }[],
  groups: { g: GroupFacts; limits: DayLimit[] }[],
  days: DayFacts[],
  feed: (date: string) => boolean,
): { plan: PlanEntry[]; corrections: Correction[] } {
  const corrections: Correction[] = [];
  const plan: PlanEntry[] = [];
  const byKey = new Map(ai.map((e) => [`${e.plant_group_id}|${e.date}`, e]));
  const known = new Set(groups.map((x) => x.g.id));
  for (const e of ai) if (!known.has(e.plant_group_id)) corrections.push({ plant_group_id: e.plant_group_id, date: e.date, fix: "unknown plant group dropped" });

  for (const { g, limits } of groups) {
    days.forEach((f, i) => {
      const l = limits[i];
      const rule = ruleEntry(g, f, l, i);
      const e = byKey.get(`${g.id}|${f.date}`);
      const fix = (s: string) => corrections.push({ plant_group_id: g.id, date: f.date, fix: s });
      if (!e) { fix("missing, rule entry used"); plan.push(rule); return; }
      let actions: PlanAction[] = [];
      for (const a of e.actions) {
        if (!(ACTION_TYPES as readonly string[]).includes(a.type)) { fix(`dropped unknown action ${a.type}`); continue; }
        const act: PlanAction = { type: a.type as ActionType };
        if (a.when && ["early_morning", "morning", "midday", "afternoon", "evening", "any"].includes(a.when)) act.when = a.when as When;
        if (a.how) act.how = a.how.slice(0, 80);
        if (a.what) act.what = a.what.slice(0, 100);
        if (a.amount && ["gal", "cups", "cans", "L"].includes(a.amount.unit) && Number.isFinite(a.amount.value)) act.amount = { value: a.amount.value, unit: a.amount.unit as Amount["unit"] };
        actions.push(act);
      }
      // Water rules.
      if (l.status === "must_not_water" && actions.some((a) => a.type === "water")) {
        fix("water replaced with skip_water (limit must_not_water)");
        actions = actions.filter((a) => a.type !== "water");
      }
      if (l.status === "must_not_water" && !actions.some((a) => a.type === "skip_water")) actions.unshift({ type: "skip_water" });
      if (l.status !== "must_not_water") actions = actions.filter((a) => a.type !== "skip_water" || l.status === "optional");
      if (l.status === "must_water" && !actions.some((a) => a.type === "water")) {
        fix("water added (limit must_water)");
        actions.unshift(rule.actions.find((a) => a.type === "water")!);
      }
      actions = actions.map((a) => {
        if (a.type !== "water" || !l.gal) return a;
        const gal = a.amount ? amountToGal(a.amount) : NaN;
        let out = a;
        if (!Number.isFinite(gal) || gal < l.gal[0] || gal > l.gal[1]) {
          const clamped = Number.isFinite(gal) ? Math.min(l.gal[1], Math.max(l.gal[0], gal)) : l.gal_mid ?? l.gal[0];
          fix(`water amount ${Number.isFinite(gal) ? gal.toFixed(2) : "missing"} gal clamped to ${clamped.toFixed(2)}`);
          out = { ...a, amount: friendlyAmount(clamped, { hand: g.hand }) };
        }
        if (l.no_evening && out.when === "evening") { fix("evening watering moved to morning (disease-prone)"); out = { ...out, when: "morning" }; }
        if (!out.when) out = { ...out, when: l.when };
        return out;
      });
      // Feed only on edibles outside fertilizer limits.
      if (actions.some((a) => a.type === "feed") && (!g.edible || !feed(f.date) || f.alerts.length > 0 || f.counted_mm >= 12)) {
        fix("feed removed (outside fertilizer limits)");
        actions = actions.filter((a) => a.type !== "feed");
      }
      actions = actions.map((a) => (a.type === "feed" ? { ...a, how: "slow-release plant food, follow the label" } : a));
      // Required protect actions.
      for (const req of requiredActions(g, f)) {
        if (!actions.some((a) => a.type === "protect")) { fix(`added ${req.what}`); actions.push(req); }
      }
      if (f.alerts.includes("storm")) actions = actions.filter((a) => a.type !== "harvest" || i === 0);
      let reason = (e.reason ?? "").trim();
      if (!reason || reason.length > 280 || FORBIDDEN.test(reason)) { fix("reason replaced"); reason = rule.reason; }
      const conf = e.confidence === "low" || e.confidence === "high" ? e.confidence : "medium";
      plan.push({ date: f.date, plant_group_id: g.id, actions, reason, confidence: conf });
    });
  }
  return { plan, corrections };
}

// ---------------------------------------------------------------- rebuild triggers and "changed because"

export interface WeatherSummary { counted_mm: number; tmax_f: number; tmin_f: number; alerts: string[] }

export const summarize = (f: DayFacts): WeatherSummary => ({ counted_mm: Math.round(f.counted_mm * 10) / 10, tmax_f: Math.round(f.tmax_f), tmin_f: Math.round(f.tmin_f), alerts: f.alert_events });

/** Meaningful forecast change (spec 7D.5): counted rain ±3 mm, a new alert, or a heat / cold threshold crossed. */
export function forecastChanged(prev: Record<string, WeatherSummary>, next: DayFacts[], frostF = 36): string | null {
  for (const f of next) {
    const p = prev[f.date];
    if (!p) continue;
    const day = dowName(f.date);
    if (Math.abs(p.counted_mm - f.counted_mm) >= 3) {
      return f.counted_mm > p.counted_mm ? `Rain on ${day} is now more likely (${inches(f.counted_mm)})` : `Rain on ${day} is now unlikely`;
    }
    const added = f.alert_events.filter((a) => !p.alerts.includes(a));
    if (added.length) return `New alert: ${added[0]}`;
    if ((p.tmax_f >= PLAN_CONFIG.heat_day_f) !== (f.tmax_f >= PLAN_CONFIG.heat_day_f)) return `${day} is now ${f.tmax_f >= PLAN_CONFIG.heat_day_f ? "much hotter" : "cooler"} than forecast`;
    if ((p.tmin_f <= frostF) !== (f.tmin_f <= frostF)) return `${day} night is now ${f.tmin_f <= frostF ? "cold enough to cover plants" : "warmer"}`;
  }
  return null;
}

/** One sentence on what changed in the plan, e.g. "Rain on Saturday is now unlikely, so watering moved to Saturday morning." */
export function changeNote(cause: string, prev: { plant_group_id: string; date: string; actions: PlanAction[] }[], next: PlanEntry[], names: Map<string, string>): string {
  const water = (e: { actions: PlanAction[] }) => e.actions.some((a) => a.type === "water");
  const prevBy = new Map(prev.map((e) => [`${e.plant_group_id}|${e.date}`, e]));
  for (const e of next) {
    const p = prevBy.get(`${e.plant_group_id}|${e.date}`);
    if (!p || water(p) === water(e)) continue;
    const who = names.get(e.plant_group_id) ?? "your plants";
    return `${cause}, so ${water(e) ? `the ${lc(who)} now get water on ${dowName(e.date)} morning` : `watering the ${lc(who)} on ${dowName(e.date)} is skipped`}.`;
  }
  return `${cause}. Your plan was updated.`;
}

/** Short label for the 7-day strip: "water 1.5 gal", "skip, rain", "check soil". */
export function shortLabel(e: Pick<PlanEntry, "actions">, l?: Pick<DayLimit, "why">): string {
  const w = e.actions.find((a) => a.type === "water");
  if (w) return `water${w.amount ? ` ${amountText(w.amount)}` : ""}`;
  if (e.actions.some((a) => a.type === "skip_water")) return l?.why === "rain_today" || l?.why === "alert" ? "skip, rain" : l?.why === "storm" ? "skip, storm" : "skip";
  if (e.actions.some((a) => a.type === "protect")) return "protect";
  if (e.actions.some((a) => a.type === "check_soil")) return "check soil";
  if (e.actions.some((a) => a.type === "harvest")) return "harvest";
  return "rest";
}
