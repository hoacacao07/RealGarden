/**
 * Bloom and fruit date predictions.
 *  - Too young (age < years_to_first_bloom) → first bloom around a month/year.
 *  - `season` trigger → next month in bloom_months, or "in season now".
 *  - `gdd` trigger → GDD_d = max(0, (Tmax + Tmin)/2 − T_base) (°F·day), accumulated from the day after
 *    the last bloom period ended. Observed/forecast days first, then daily climate normals.
 *    Earliest uses normals + 1 std, latest uses normals − 1 std.
 *  - A photo showing buds overrides with bud_to_bloom_days; flowering predicts fruit with bloom_to_fruit_days.
 */
import type { Plant } from "../types";
import { addDays, monthOf, yearsBetween } from "./geo";

export interface Prediction {
  event: "bloom" | "fruit";
  earliest: string; // YYYY-MM-DD
  latest: string;
  confidence: "low" | "medium" | "high";
  basis: string;
  now?: boolean; // happening now
}

/** Climate normals keyed by "MM-DD": mean daily mean temperature and its std across years (°F). */
export interface Normals { tmean_f: Record<string, number>; tmean_std_f: Record<string, number> }

export interface TempDay { date: string; tmin_f: number; tmax_f: number }

export const gddDay = (tmaxF: number, tminF: number, baseF: number) => Math.max(0, (tmaxF + tminF) / 2 - baseF);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m: number) => MONTHS[(m - 1 + 12) % 12];
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** First date on/after `fromIso` that falls in one of `months`, as that month's [first, last] day. */
export function nextMonthWindow(fromIso: string, months: number[]): [string, string] | null {
  if (!months.length) return null;
  let y = Number(fromIso.slice(0, 4));
  let m = monthOf(fromIso);
  for (let i = 0; i < 24; i++) {
    if (months.includes(m)) {
      const start = i === 0 ? fromIso : iso(y, m, 1);
      return [start, iso(y, m, lastDayOfMonth(y, m))];
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

/** End of the current run of consecutive months (wrapping Dec→Jan) that contains `month`. */
function runEnd(todayIso: string, months: number[]): string {
  let y = Number(todayIso.slice(0, 4));
  let m = monthOf(todayIso);
  for (let i = 0; i < 12; i++) {
    const nm = m === 12 ? 1 : m + 1;
    if (!months.includes(nm)) return iso(y, m, lastDayOfMonth(y, m));
    if (nm === 1) y += 1;
    m = nm;
  }
  return iso(y, m, lastDayOfMonth(y, m));
}

/** Day after the most recent bloom period ended before `todayIso`. */
export function lastBloomEnd(todayIso: string, months: number[]): string {
  let y = Number(todayIso.slice(0, 4));
  let m = monthOf(todayIso) - 1;
  for (let i = 0; i < 24; i++) {
    if (m < 1) { m = 12; y -= 1; }
    const next = m === 12 ? 1 : m + 1;
    if (months.includes(m) && !months.includes(next)) return addDays(iso(y, m, lastDayOfMonth(y, m)), 1);
    m -= 1;
  }
  return iso(Number(todayIso.slice(0, 4)), 1, 1);
}

/**
 * Accumulate GDD from `startIso` and return the first dates the target is reached using
 * normals (+1 std → earliest, −1 std → latest). Days in `observed` use actual temps.
 */
export function gddDates(
  startIso: string, todayIso: string, target: number, baseF: number, observed: TempDay[], normals: Normals, horizonDays = 500,
): { earliest: string | null; latest: string | null; accumulated: number } {
  const obs = new Map(observed.map((d) => [d.date, gddDay(d.tmax_f, d.tmin_f, baseF)]));
  const norm = (dIso: string, k: number) => {
    const key = dIso.slice(5);
    const mu = normals.tmean_f[key] ?? normals.tmean_f["02-28"];
    const sd = normals.tmean_std_f[key] ?? 0;
    return Math.max(0, mu + k * sd - baseF);
  };
  let early = 0;
  let late = 0;
  let accToday = 0;
  let earliest: string | null = null;
  let latest: string | null = null;
  for (let i = 0, d = startIso; i < horizonDays; i++, d = addDays(d, 1)) {
    const o = obs.get(d);
    early += o ?? norm(d, +1);
    late += o ?? norm(d, -1);
    if (d < todayIso) accToday += o ?? norm(d, 0);
    if (!earliest && early >= target) earliest = d < todayIso ? todayIso : d;
    if (!latest && late >= target) latest = d < todayIso ? todayIso : d;
    if (earliest && latest) break;
  }
  return { earliest, latest, accumulated: Math.round(accToday) };
}

export interface PhenoInput {
  plant: Plant;
  today: string;
  plantedOn: string;
  observed?: TempDay[]; // history + forecast days
  normals?: Normals;
  photo?: { stage: "budding" | "flowering" | "fruiting" | string; date: string };
}

export function predictBloom(x: PhenoInput): Prediction | null {
  const p = x.plant;
  if (!p.bloom_months.length) return null;
  if (x.photo?.stage === "budding") {
    return {
      event: "bloom", earliest: addDays(x.photo.date, p.bud_to_bloom_days[0]), latest: addDays(x.photo.date, p.bud_to_bloom_days[1]),
      confidence: "high", basis: `Buds in your ${x.photo.date} check-in photo; ${p.common_name} opens ${p.bud_to_bloom_days[0]}–${p.bud_to_bloom_days[1]} days after budding`,
    };
  }
  if (x.photo?.stage === "flowering") {
    return { event: "bloom", earliest: x.photo.date, latest: x.photo.date, confidence: "high", basis: "Flowers seen in your latest check-in photo", now: true };
  }
  const age = yearsBetween(x.plantedOn, x.today);
  if (age < p.years_to_first_bloom) {
    const firstPossible = addDays(x.plantedOn, Math.round(p.years_to_first_bloom * 365.25));
    const w = nextMonthWindow(firstPossible < x.today ? x.today : firstPossible, p.bloom_months);
    if (!w) return null;
    const m = monthOf(w[0]);
    return {
      event: "bloom", earliest: w[0], latest: w[1], confidence: "low",
      basis: `Young plant. First bloom around ${monthName(m)} ${w[0].slice(0, 4)} (usually ${p.years_to_first_bloom} yr after planting)`,
    };
  }
  if (p.bloom_trigger === "gdd" && p.bloom_gdd && x.normals) {
    const start = lastBloomEnd(x.today, p.bloom_months);
    const r = gddDates(start, x.today, p.bloom_gdd, p.gdd_base_f, x.observed ?? [], x.normals);
    if (r.earliest && r.latest) {
      const now = p.bloom_months.includes(monthOf(x.today)) && r.earliest <= x.today;
      return {
        event: "bloom", earliest: r.earliest, latest: r.latest, confidence: "medium", now,
        basis: `${r.accumulated.toLocaleString()} of ${p.bloom_gdd.toLocaleString()} growing degree days (base ${p.gdd_base_f}°F) since ${start}; forecast, then Tampa normals ±1 std`,
      };
    }
  }
  const m = monthOf(x.today);
  if (p.bloom_months.includes(m)) {
    return { event: "bloom", earliest: x.today, latest: runEnd(x.today, p.bloom_months), confidence: "medium", basis: "In season now", now: true };
  }
  const w = nextMonthWindow(x.today, p.bloom_months);
  if (!w) return null;
  return { event: "bloom", earliest: w[0], latest: w[1], confidence: "medium", basis: `Usually blooms ${p.bloom_months.map(monthName).join(", ")} in Florida` };
}

export function predictFruit(x: PhenoInput, bloom: Prediction | null): Prediction | null {
  const p = x.plant;
  if (!p.fruit_months.length || !p.fruit_colors.length) return null;
  const dio = p.dioecious ? " Needs a male and female plant nearby." : "";
  if (x.photo?.stage === "flowering") {
    return {
      event: "fruit", earliest: addDays(x.photo.date, p.bloom_to_fruit_days[0]), latest: addDays(x.photo.date, p.bloom_to_fruit_days[1]),
      confidence: "high", basis: `Flowering in your check-in photo; fruit follows in ${p.bloom_to_fruit_days[0]}–${p.bloom_to_fruit_days[1]} days.${dio}`,
    };
  }
  if (bloom && bloom.confidence === "low") {
    const w = nextMonthWindow(addDays(bloom.earliest, p.bloom_to_fruit_days[0]), p.fruit_months);
    return w ? { event: "fruit", earliest: w[0], latest: w[1], confidence: "low", basis: `After first bloom.${dio}` } : null;
  }
  if (p.fruit_months.includes(monthOf(x.today))) {
    return { event: "fruit", earliest: x.today, latest: runEnd(x.today, p.fruit_months), confidence: "medium", basis: `Fruit season now.${dio}`, now: true };
  }
  const w = nextMonthWindow(x.today, p.fruit_months);
  return w ? { event: "fruit", earliest: w[0], latest: w[1], confidence: "medium", basis: `Usually fruits ${p.fruit_months.map(monthName).join(", ")}.${dio}` } : null;
}

export function predict(x: PhenoInput): Prediction[] {
  const b = predictBloom(x);
  const f = predictFruit(x, b);
  return [b, f].filter((v): v is Prediction => !!v);
}

/** "Aug 13 – Aug 31". Adds the year when the range is not in `todayIso`'s year (e.g. a young plant's first bloom). */
export function formatRange(a: string, b: string, todayIso?: string): string {
  const fmt = (s: string) => `${monthName(monthOf(s))} ${Number(s.slice(8, 10))}`;
  const yr = todayIso && (a.slice(0, 4) !== todayIso.slice(0, 4) || b.slice(0, 4) !== todayIso.slice(0, 4));
  const tail = (s: string) => (yr ? `${fmt(s)}, ${s.slice(0, 4)}` : fmt(s));
  if (a === b) return tail(a);
  if (yr && a.slice(0, 4) === b.slice(0, 4)) return `${fmt(a)} – ${tail(b)}`;
  return `${tail(a)} – ${tail(b)}`;
}
