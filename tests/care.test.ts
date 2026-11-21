import { describe, expect, it } from "vitest";

import { careWeek, dayWord, weekSummary, type CareInput } from "../lib/engine/careWeek";
import type { Task } from "../lib/engine/tasks";

const today = "2026-11-21";
const base: CareInput = { today, alerts: [], zones: [], pots: [], stormPause: false, harvestNow: [], calendar: [] };
const wx = (o: Partial<{ tmax_f: number; rain_mm: number }>, n = 7) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${22 + i}`, tmin_f: 60, tmax_f: 80, rain_mm: 0, et0_mm: 3, gust_mph: 10, ...o }));

describe("This week", () => {
  it("storm steps come first and are urgent; watering is dropped while paused", () => {
    const items = careWeek({
      ...base, stormPause: true,
      alerts: [{ id: "storm:Hurricane Warning", type: "storm", severity: "high", title: "Hurricane", steps: [{ when: "Now", text: "Bring every pot inside" }, { when: "Today", text: "Stake young trees" }] }],
      zones: [{ name: "Bed", irrigation: "drip", days: [{ date: today, recommendation: "water", gallons: 20, is_forecast: true }] }],
      harvestNow: ["Tomato"],
    });
    expect(items[0]).toMatchObject({ kind: "storm", urgent: true, text: "Bring every pot inside" });
    expect(items.some((i) => i.kind === "water")).toBe(false);
    expect(items.some((i) => i.kind === "harvest")).toBe(false);
  });
  it("stored alert tasks keep their rule order ahead of everything else", () => {
    const items = careWeek({ ...base, alertTasks: [{ id: "a", title: "First", due_at: today, priority: "urgent" }, { id: "b", title: "Second", due_at: today, priority: "urgent" }] });
    expect(items.map((i) => i.text)).toEqual(["First", "Second"]);
  });
  it("one water and one skip line per zone, pots grouped by day, calendar within 7 days only", () => {
    const cal: Task[] = [
      { id: "plant:lettuce", kind: "plant", title: "Plant lettuce", detail: "", due_at: "2026-11-24", priority: "normal", source: "calendar", done: false },
      { id: "harvest:x", kind: "harvest", title: "Start harvesting kale", detail: "", due_at: "2026-12-20", priority: "normal", source: "calendar", done: false },
    ];
    const items = careWeek({
      ...base, calendar: cal,
      zones: [{ name: "Butterfly bed", irrigation: "drip", days: [
        { date: "2026-11-22", recommendation: "water", gallons: 30, is_forecast: true },
        { date: "2026-11-24", recommendation: "water", gallons: 30, is_forecast: true },
        { date: "2026-11-23", recommendation: "skip", gallons: 0, is_forecast: true },
      ] }],
      pots: [{ name: "Basil", days: [{ date: "2026-11-22", water: true }] }, { name: "Cherry tomato", days: [{ date: "2026-11-22", water: true }] }],
    });
    expect(items.filter((i) => i.kind === "water" && i.text.includes("butterfly bed"))).toHaveLength(1);
    expect(items.some((i) => i.text === "Skip watering the butterfly bed, rain is coming")).toBe(true);
    expect(items.some((i) => i.text === "Water the basil and cherry tomato pots")).toBe(true);
    expect(items.some((i) => i.text === "Plant lettuce")).toBe(true);
    expect(items.some((i) => i.text.includes("kale"))).toBe(false);
  });
  it("day words", () => {
    expect(dayWord(today, today)).toBe("Today");
    expect(dayWord("2026-11-22", today)).toBe("Tomorrow");
    expect(dayWord("2026-11-24", today)).toBe("Tuesday");
  });
  it("plain weather summary", () => {
    expect(weekSummary(wx({ tmax_f: 93 }), { balcony: true, stormPause: false, frost: false })).toMatch(/water the pots every morning/);
    expect(weekSummary(wx({ rain_mm: 10 }), { balcony: false, stormPause: false, frost: false })).toMatch(/water less/);
    expect(weekSummary(wx({}), { balcony: false, stormPause: true, frost: false })).toMatch(/paused/);
  });
});
