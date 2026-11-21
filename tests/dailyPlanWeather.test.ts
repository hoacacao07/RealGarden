import { describe, expect, it } from "vitest";

import { expandPlanFixture } from "../lib/clients/openmeteo";
import {
  alertFlags, countRain, dayFacts, forecastChanged, groundBucket, localTime, rainHistory, rainWeight, replayDeficit, summarize, weatherIcon,
  type HourWx,
} from "../lib/engine/dailyPlan";

const hour = (date: string, h: number, precip_mm: number, prob_pct: number): HourWx =>
  ({ time: `${date}T${String(h).padStart(2, "0")}:00`, precip_mm, prob_pct, temp_f: 80, rh_pct: 70, gust_mph: 10 });

describe("rain counting with probabilities (7D.3)", () => {
  it("weights by probability", () => {
    expect(rainWeight(80)).toBe(1);
    expect(rainWeight(60)).toBe(1);
    expect(rainWeight(59)).toBe(0.5);
    expect(rainWeight(30)).toBe(0.5);
    expect(rainWeight(29)).toBe(0);
  });
  it("sums r × w, keeps rain hours, effective = 0.8 × counted", () => {
    const r = countRain([hour("2026-11-22", 9, 3, 80), hour("2026-11-22", 15, 4, 40), hour("2026-11-22", 18, 5, 10)]);
    expect(r.raw_mm).toBe(12);
    expect(r.counted_mm).toBe(5); // 3 + 2 + 0
    expect(r.effective_mm).toBeCloseTo(4);
    expect(r.before_noon_mm).toBe(3);
    expect(r.rain_hours).toEqual([9, 15]);
  });
  it("counts under 2 mm in a day as 0", () => {
    const r = countRain([hour("2026-11-22", 15, 1.5, 90)]);
    expect(r.counted_mm).toBe(0);
    expect(r.effective_mm).toBe(0);
  });
});

describe("fixture forecast", () => {
  const today = "2026-11-21";
  it("has 7 days of 24 hours, 3 past days, and days that differ", () => {
    const fx = expandPlanFixture(today);
    expect(fx.days).toHaveLength(7);
    expect(fx.hours).toHaveLength(7 * 24);
    expect(fx.past.map((p) => p.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
    const f = dayFacts(fx.days, fx.hours);
    expect(f[0].counted_mm).toBe(0); // dry hot day
    expect(weatherIcon(f[0])).toBe("hot");
    expect(f[1].counted_mm).toBe(0); // light rain (2.4 mm × 0.5 = 1.2 → under 2 mm)
    expect(weatherIcon(f[1])).toBe("showers");
    expect(f[2].counted_mm).toBeCloseTo(17); // heavy rain 5 h × 3.4 mm at 80 %
    expect(f[2].rain_hours[0]).toBe(13);
    expect(weatherIcon(f[2])).toBe("rain");
    expect(f[3].tmax_f).toBe(71); // cool day
  });
  it("the tomorrow_rain variant moves rain to tomorrow morning and is a meaningful change", () => {
    const base = expandPlanFixture(today);
    const v = expandPlanFixture(today, "tomorrow_rain");
    const before = dayFacts(base.days, base.hours);
    const after = dayFacts(v.days, v.hours);
    expect(after[1].before_noon_mm).toBeCloseTo(16);
    const prev = Object.fromEntries(before.map((f) => [f.date, summarize(f)]));
    expect(forecastChanged(prev, after)).toMatch(/^Rain on \w+ is now more likely/);
  });
});

describe("alerts → flags", () => {
  it("maps events, converts UTC to Florida time, ignores inactive and unrelated alerts", () => {
    expect(localTime("2026-11-22T03:00:00Z")).toBe("2026-11-21T22:00");
    const flags = alertFlags([
      { event: "Flood Watch", onset: "2026-11-22T03:00:00Z", ends: new Date("2026-11-23T15:00:00Z") },
      { event: "Hurricane Warning", onset: null, ends: null, active: false },
      { event: "Rip Current Statement", onset: null, ends: null },
      { event: "Heavy rain", onset: null, ends: null },
    ]);
    expect(flags).toEqual([
      { event: "Flood Watch", kind: "flood_rain", onset: "2026-11-21T22:00", ends: "2026-11-23T10:00" },
      { event: "Heavy rain", kind: "flood_rain", onset: null, ends: null },
    ]);
    const days = [21, 22, 23, 24].map((d) => ({ date: `2026-11-${d}`, et0_mm: 3, tmax_f: 80, tmin_f: 65, uv_max: 5 }));
    const f = dayFacts(days, [], flags.slice(0, 1));
    expect(f.map((x) => x.alerts.length)).toEqual([1, 1, 1, 0]); // starts Nov 21 local evening, ends Nov 23
  });
});

describe("past rain and 'It rained here'", () => {
  const today = "2026-11-21";
  const past = [
    { date: "2026-11-20", rain_mm: 0, et0_mm: 4 },
    { date: "2026-11-18", rain_mm: 0, et0_mm: 4 },
    { date: "2026-11-19", rain_mm: 0, et0_mm: 4 },
  ];
  it("sorts history and splits taps into past and today", () => {
    const r = rainHistory(past, ["2026-11-19", "2026-11-21", "2026-11-10"], today);
    expect(r.hist.map((h) => h.date)).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(r.past_logs).toEqual([{ date: "2026-11-19", kind: "rained" }]);
    expect(r.today_logs).toEqual([{ date: today, kind: "rained" }]);
  });
  it("a tap refills the soil even when the forecast cell stayed dry", () => {
    const b = groundBucket({ theta: 0.1, zr_in: 12, p: 0.5, kc: 1, canopy_sqft: 4, irrigation: "none" });
    const dry = rainHistory(past, [], today);
    const tapped = rainHistory(past, ["2026-11-20"], today);
    expect(replayDeficit(b, dry.hist, dry.past_logs)).toBeGreaterThan(0);
    expect(replayDeficit(b, tapped.hist, tapped.past_logs)).toBe(0);
  });
});
