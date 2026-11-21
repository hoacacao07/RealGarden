/**
 * One-time script: pull Open-Meteo archive data for a Tampa point into data/scenarios/.
 *   npm run fetch-scenarios
 * Each scenario has 14 days of history before "today" plus a 7-day "forecast" window.
 * Also writes normals.json: 10-year (2015–2024) daily mean temperature and std per calendar day.
 */
import fs from "node:fs";
import path from "node:path";

import type { NwsAlert, WeatherDay } from "../lib/types";

const LAT = 27.95;
const LON = -82.46;
const OUT = path.join(process.cwd(), "data", "scenarios");
const DAILY = "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_min,temperature_2m_max,wind_gusts_10m_max";

async function fetchDays(start: string, end: string): Promise<WeatherDay[]> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  Object.entries({
    latitude: LAT, longitude: LON, start_date: start, end_date: end, daily: DAILY,
    timezone: "America/New_York", temperature_unit: "fahrenheit", wind_speed_unit: "mph",
  }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const d = (await res.json()).daily;
  return d.time.map((t: string, i: number) => ({
    date: t,
    tmin_f: d.temperature_2m_min[i],
    tmax_f: d.temperature_2m_max[i],
    rain_mm: d.precipitation_sum[i] ?? 0,
    et0_mm: d.et0_fao_evapotranspiration[i] ?? 0,
    gust_mph: d.wind_gusts_10m_max[i] ?? 0,
  }));
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

async function save(name: string, title: string, description: string, today: string, alert: NwsAlert | null = null) {
  const days = await fetchDays(addDays(today, -14), addDays(today, 6));
  const history = days.filter((d) => d.date < today);
  const forecast = days.filter((d) => d.date >= today);
  const doc = {
    name, title, description, today, lat: LAT, lon: LON,
    source: "Open-Meteo historical weather archive (ERA5-based)", alert, history, forecast,
  };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(doc, null, 1) + "\n");
  console.log(
    `${name}: today=${today} rain=${sum(forecast.map((d) => d.rain_mm)).toFixed(1)}mm ` +
      `min low=${Math.min(...forecast.map((d) => d.tmin_f)).toFixed(1)}F max gust=${Math.max(...forecast.map((d) => d.gust_mph)).toFixed(0)}mph`,
  );
}

async function normals() {
  const days = await fetchDays("2015-01-01", "2024-12-31");
  const by = new Map<string, number[]>();
  for (const d of days) {
    const k = d.date.slice(5);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push((d.tmin_f + d.tmax_f) / 2);
  }
  const tmean: Record<string, number> = {};
  const std: Record<string, number> = {};
  for (const [k, v] of [...by.entries()].sort()) {
    const mu = sum(v) / v.length;
    tmean[k] = Math.round(mu * 10) / 10;
    std[k] = Math.round(Math.sqrt(sum(v.map((x) => (x - mu) ** 2)) / v.length) * 10) / 10;
  }
  fs.writeFileSync(
    path.join(OUT, "normals.json"),
    JSON.stringify({ lat: LAT, lon: LON, years: "2015-2024", source: "Open-Meteo archive", tmean_f: tmean, tmean_std_f: std }) + "\n",
  );
  console.log(`normals: ${Object.keys(tmean).length} days`);
}

/** Pick a 7-day window from [start, end] by a score function on rain sums. */
async function pickWeek(start: string, end: string, score: (rain: number, all: number[]) => number) {
  const days = await fetchDays(start, end);
  const sums = days.slice(0, -6).map((_, i) => sum(days.slice(i, i + 7).map((d) => d.rain_mm)));
  let best = 0;
  for (let i = 1; i < sums.length; i++) if (score(sums[i], sums) > score(sums[best], sums)) best = i;
  return { today: days[best].date, rain: sums[best] };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await save("cold_snap", "Cold snap", "January 19–25, 2025 at Tampa. A winter storm brought lows in the upper 30s °F.", "2025-01-19");
  await save("hurricane", "Hurricane Milton", "October 6–12, 2024. Milton made landfall near Siesta Key on Oct 9. Includes a synthetic Hurricane Warning.", "2024-10-06", {
    event: "Hurricane Warning",
    headline: "Hurricane Warning for Hillsborough County (synthetic demo alert)",
    description: "Hurricane conditions expected within 36 hours. Synthetic demo text, not an official NWS product.",
    severity: "Extreme",
    synthetic: true,
  });
  const wet = await pickWeek("2024-06-15", "2024-08-31", (r) => r);
  console.log(`wettest summer week 2024 starts ${wet.today} (${wet.rain.toFixed(1)} mm)`);
  await save("rainy_week", "Rainy week", `Wettest week of summer 2024 at Tampa, starting ${wet.today}. Picked from archive data.`, wet.today);
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const typical = await pickWeek("2025-03-15", "2025-05-15", (r, all) => -Math.abs(r - median(all)));
  console.log(`typical spring week 2025 starts ${typical.today} (${typical.rain.toFixed(1)} mm)`);
  await save("normal_week", "Normal week", `A typical spring week at Tampa, starting ${typical.today}. Picked from archive data.`, typical.today);
  await normals();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
