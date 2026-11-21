/**
 * Daily Care Plan weather facts (Phase 12.5, spec 7D.3 "Weather"). Built fresh for each plan run:
 *   - Open-Meteo hourly forecast for 7 days + daily ET0, highs, lows, UV (lib/clients/openmeteo.ts getPlanWeather)
 *   - observed rain for the last 3 days (past_days=3) plus the user's "It rained here" taps (CareLog kind "rained")
 *   - active alerts from the Phase 12 pipeline (NWS and Open-Meteo heavy rain), as local-time flags
 * Then rain is counted per day with probability weights (engine dayFacts / countRain).
 * The presenter's "Change tomorrow's forecast" sets Garden.demo_forecast to a fixture variant.
 */
import { getPlanWeather } from "./clients/openmeteo";
import { prisma } from "./db";
import { addDays } from "./engine/geo";
import {
  alertFlags, dayFacts, rainHistory, summarize, weatherIcon,
  type AlertFlag, type DayFacts, type HistDay, type HourWx, type LogEvent, type WeatherSummary,
} from "./engine/dailyPlan";

export interface WeatherFacts {
  today: string;
  days: DayFacts[];
  hours: HourWx[];
  /** Past days for the soil replay (observed rain). */
  hist: HistDay[];
  /** "It rained here" taps: before today go into the replay, today's apply on top of the morning state. */
  rain_logs: { past: LogEvent[]; today: LogEvent[] };
  alerts: AlertFlag[];
  source: "live" | "fixture";
  variant: string | null;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function weatherFacts(g: { id: string; site: { lat: number; lon: number } }): Promise<WeatherFacts> {
  const row = await prisma.garden.findUnique({ where: { id: g.id }, select: { demo_forecast: true } }).catch(() => null);
  const wx = await getPlanWeather(g.site.lat, g.site.lon, row?.demo_forecast ?? null);
  const since = addDays(wx.today, -3);
  const [alerts, taps] = await Promise.all([
    prisma.alert.findMany({ where: { garden_id: g.id, active: true }, select: { event: true, onset: true, ends: true, active: true } }).catch(() => []),
    prisma.careLog.findMany({
      where: { garden_id: g.id, kind: "rained", date: { gte: new Date(since + "T00:00:00Z") } }, select: { date: true },
    }).catch(() => []),
  ]);
  const flags = alertFlags(alerts);
  const r = rainHistory(wx.past, taps.map((t) => isoDate(t.date)), wx.today);
  return {
    today: wx.today, days: dayFacts(wx.days, wx.hours, flags), hours: wx.hours, hist: r.hist,
    rain_logs: { past: r.past_logs, today: r.today_logs }, alerts: flags, source: wx.source, variant: wx.variant,
  };
}

/** Per-day weather summary stored on each DailyPlan row (weather_summary) and used for rebuild triggers. */
export function weatherSummaries(days: DayFacts[]): Record<string, WeatherSummary & { icon: ReturnType<typeof weatherIcon>; rain_hours: number[]; max_prob: number }> {
  return Object.fromEntries(days.map((f) => [f.date, { ...summarize(f), icon: weatherIcon(f), rain_hours: f.rain_hours, max_prob: f.max_prob }]));
}
