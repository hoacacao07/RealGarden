/** Open-Meteo forecast (no key): 14 past days + 7 forecast days of Tmin/Tmax (°F), rain and ET0 (mm), gust (mph). */
import { addDays } from "../engine/geo";
import type { WeatherBundle, WeatherDay } from "../types";
import { cached, fetchJson, fixture, liveOrFixture, readData } from "./base";

interface Scenario {
  name: string; title: string; description: string; today: string; source: string;
  alert: import("../types").NwsAlert | null; history: WeatherDay[]; forecast: WeatherDay[];
}

export const SCENARIOS = ["cold_snap", "hurricane", "rainy_week", "normal_week"] as const;
export type ScenarioName = (typeof SCENARIOS)[number];
export const isScenario = (s: unknown): s is ScenarioName => SCENARIOS.includes(s as ScenarioName);

export function loadScenario(name: ScenarioName): Scenario {
  return readData<Scenario>(`scenarios/${name}.json`);
}

export function scenarioList() {
  return SCENARIOS.map((n) => {
    const s = loadScenario(n);
    return { name: n, title: s.title, description: s.description, today: s.today };
  });
}

/** The saved forecast fixture is re-dated so its forecast starts today. */
function fixtureBundle(today: string): WeatherBundle {
  const fx = fixture<{ history: WeatherDay[]; forecast: WeatherDay[] }>("openmeteo_forecast.json");
  const days = [...fx.history, ...fx.forecast];
  const start = addDays(today, -fx.history.length);
  const redated = days.map((d, i) => ({ ...d, date: addDays(start, i) }));
  return {
    today, history: redated.slice(0, fx.history.length), forecast: redated.slice(fx.history.length),
    source: "Saved Open-Meteo forecast (demo fixture)", scenario: null,
  };
}

const todayEastern = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export async function getWeather(lat: number, lon: number, scenario?: string | null): Promise<WeatherBundle & { source_kind: string }> {
  if (isScenario(scenario)) {
    const s = loadScenario(scenario);
    return { today: s.today, history: s.history, forecast: s.forecast, source: `${s.title}: ${s.source}`, scenario, source_kind: "scenario" };
  }
  const today = todayEastern();
  const key = `wx:${lat.toFixed(2)}:${lon.toFixed(2)}:${today}`;
  return cached(key, 30 * 60_000, async () => {
    const r = await liveOrFixture("open-meteo", {
      live: async (signal) => {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        Object.entries({
          latitude: lat, longitude: lon, timezone: "America/New_York", past_days: 14, forecast_days: 7,
          daily: "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min,temperature_2m_max,wind_gusts_10m_max",
          temperature_unit: "fahrenheit", wind_speed_unit: "mph",
        }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        const j = await fetchJson<{ daily: Record<string, (number | null)[]> & { time: string[] } }>(url.toString(), { signal });
        const d = j.daily;
        const days: WeatherDay[] = d.time.map((t, i) => ({
          date: t, tmin_f: d.temperature_2m_min[i] ?? 60, tmax_f: d.temperature_2m_max[i] ?? 80,
          rain_mm: d.precipitation_sum[i] ?? 0, et0_mm: d.et0_fao_evapotranspiration[i] ?? 0, gust_mph: d.wind_gusts_10m_max[i] ?? 0,
        }));
        return { today, history: days.filter((x) => x.date < today), forecast: days.filter((x) => x.date >= today).slice(0, 7), source: "Open-Meteo forecast", scenario: null } as WeatherBundle;
      },
      fallback: () => fixtureBundle(today),
    });
    return { ...r.data, source_kind: r.source };
  });
}

export interface HourlyPoint { time: string; precip_mm: number; gust_mph: number }

/** Next 48 h of hourly precipitation and gusts, for heavy rain and wind that may not have an NWS alert yet. */
export async function getHourly(lat: number, lon: number): Promise<{ hours: HourlyPoint[]; source: "live" | "fixture" }> {
  return cached(`wxh:${lat.toFixed(2)}:${lon.toFixed(2)}`, 30 * 60_000, async () => {
    const r = await liveOrFixture("open-meteo-hourly", {
      live: async (signal) => {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        Object.entries({ latitude: lat, longitude: lon, timezone: "UTC", forecast_hours: 48, hourly: "precipitation,wind_gusts_10m", wind_speed_unit: "mph" })
          .forEach(([k, v]) => url.searchParams.set(k, String(v)));
        const j = await fetchJson<{ hourly: { time: string[]; precipitation: (number | null)[]; wind_gusts_10m: (number | null)[] } }>(url.toString(), { signal });
        return j.hourly.time.map((t, i) => ({ time: new Date(t + "Z").toISOString(), precip_mm: j.hourly.precipitation[i] ?? 0, gust_mph: j.hourly.wind_gusts_10m[i] ?? 0 }));
      },
      fallback: () => {
        const fx = fixture<{ precip_mm: number[]; gust_mph: number[] }>("openmeteo_hourly.json");
        const t0 = Math.floor(Date.now() / 3600e3) * 3600e3;
        return fx.precip_mm.map((p, i) => ({ time: new Date(t0 + i * 3600e3).toISOString(), precip_mm: p, gust_mph: fx.gust_mph[i] ?? 0 }));
      },
    });
    return { hours: r.data, source: r.source };
  });
}

// ---------------------------------------------------------------- Phase 12.5: Daily Care Plan weather

export interface PlanWeather {
  today: string;
  days: import("../engine/dailyPlan").DayWx[];
  hours: import("../engine/dailyPlan").HourWx[];
  /** Observed rain and ET0 for the last 3 days (Open-Meteo past_days=3). */
  past: import("../engine/dailyPlan").PastWx[];
  source: "live" | "fixture";
  variant: string | null;
}

interface FxDay { tmax_f: number; tmin_f: number; et0_mm: number; uv_max: number; rh_pct: number; gust_mph: number; rain: { start: number; hours: number; mm_per_h: number; prob: number }[] }

/** Expand the saved day shapes into hourly values (temperature curve: low at 6 AM, high at 3 PM). */
export function expandPlanFixture(today: string, variant: string | null = null): Pick<PlanWeather, "days" | "hours" | "past"> {
  const fx = fixture<{ past?: { rain_mm: number; et0_mm: number }[]; days: FxDay[]; variants: Record<string, Record<string, FxDay>> }>("openmeteo_plan.json");
  const v = variant ? fx.variants[variant] ?? {} : {};
  const days: PlanWeather["days"] = [];
  const hours: PlanWeather["hours"] = [];
  const pastFx = fx.past ?? [];
  const past = pastFx.map((p, i) => ({ date: addDays(today, i - pastFx.length), rain_mm: p.rain_mm, et0_mm: p.et0_mm }));
  fx.days.forEach((d0, i) => {
    const d = v[String(i)] ?? d0;
    const date = addDays(today, i);
    days.push({ date, et0_mm: d.et0_mm, tmax_f: d.tmax_f, tmin_f: d.tmin_f, uv_max: d.uv_max });
    for (let h = 0; h < 24; h++) {
      const t = h >= 6 && h <= 15 ? (h - 6) / 9 : h > 15 ? 1 - (h - 15) / 15 : 1 - (h + 9) / 15;
      const block = d.rain.find((r) => h >= r.start && h < r.start + r.hours);
      hours.push({
        time: `${date}T${String(h).padStart(2, "0")}:00`, precip_mm: block ? block.mm_per_h : 0, prob_pct: block ? block.prob : 5,
        temp_f: Math.round(d.tmin_f + (d.tmax_f - d.tmin_f) * Math.max(0, Math.min(1, t))), rh_pct: d.rh_pct, gust_mph: d.gust_mph,
      });
    }
  });
  return { days, hours, past };
}

/**
 * 7 days of hourly rain (with probability), temperature, humidity and gusts plus daily ET0, highs, lows and UV, and the
 * last 3 days of observed rain and ET0 (past_days=3) for the soil replay.
 */
export async function getPlanWeather(lat: number, lon: number, variant: string | null = null): Promise<PlanWeather> {
  const today = todayEastern();
  if (variant) return { today, ...expandPlanFixture(today, variant), source: "fixture", variant };
  return cached(`wxp:${lat.toFixed(2)}:${lon.toFixed(2)}:${today}`, 30 * 60_000, async () => {
    const r = await liveOrFixture("open-meteo-plan", {
      live: async (signal) => {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        Object.entries({
          latitude: lat, longitude: lon, timezone: "America/New_York", past_days: 3, forecast_days: 7,
          hourly: "precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,wind_gusts_10m",
          daily: "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,uv_index_max",
          temperature_unit: "fahrenheit", wind_speed_unit: "mph",
        }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
        type J = { hourly: Record<string, (number | null)[]> & { time: string[] }; daily: Record<string, (number | null)[]> & { time: string[] } };
        const j = await fetchJson<J>(url.toString(), { signal });
        const h = j.hourly;
        const d = j.daily;
        // Past days are observed (rain is a sum, no probability); forecast days start today.
        const past = d.time.flatMap((t, i) => (t < today ? [{ date: t, rain_mm: d.precipitation_sum[i] ?? 0, et0_mm: d.et0_fao_evapotranspiration[i] ?? 3 }] : []));
        const days = d.time.flatMap((t, i) => (t >= today
          ? [{ date: t, et0_mm: d.et0_fao_evapotranspiration[i] ?? 3, tmax_f: d.temperature_2m_max[i] ?? 80, tmin_f: d.temperature_2m_min[i] ?? 60, uv_max: d.uv_index_max[i] ?? 5 }]
          : [])).slice(0, 7);
        const hours = h.time.flatMap((t, i) => (t.slice(0, 10) >= today
          ? [{
            time: t, precip_mm: h.precipitation[i] ?? 0, prob_pct: h.precipitation_probability[i] ?? 0, temp_f: h.temperature_2m[i] ?? 75,
            rh_pct: h.relative_humidity_2m[i] ?? 70, gust_mph: h.wind_gusts_10m[i] ?? 0,
          }]
          : []));
        return { days, hours, past };
      },
      fallback: () => expandPlanFixture(today),
    });
    return { today, ...r.data, source: r.source, variant: null };
  });
}
