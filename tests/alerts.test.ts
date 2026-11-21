import { describe, expect, it } from "vitest";

import { alertTasks, dedupeKey, followUpTasks, FREEZE_SAFETY, isHeavyRain, moveFertilizer, pausesWater, rainNext24h, ruleFor } from "../lib/engine/alertTasks";
import { BRING_INSIDE, EMPTY_SAUCERS, SAFETY_LINE } from "../lib/engine/balcony";
import { nearbyStorms } from "../lib/clients/nhc";

const now = "2026-09-10T14:00:00.000Z";
const yard = { now, balcony: false, young_trees: ["Live Oak"], tall: ["Firebush"], tender: ["Basil"], ripe: ["Tomato"] };
const titles = (r: ReturnType<typeof alertTasks>) => r!.tasks.map((t) => t.title);

describe("rule table", () => {
  it("maps NWS events to rules", () => {
    expect(ruleFor("Hurricane Warning")).toBe("tropical_warning");
    expect(ruleFor("Tropical Storm Watch")).toBe("tropical_watch");
    expect(ruleFor("Flash Flood Warning")).toBe("flood");
    expect(ruleFor("Flood Watch")).toBe("flood");
    expect(ruleFor("Severe Thunderstorm Warning")).toBe("severe_thunderstorm");
    expect(ruleFor("Wind Advisory")).toBe("wind");
    expect(ruleFor("Hard Freeze Warning")).toBe("freeze");
    expect(ruleFor("Frost Advisory")).toBe("freeze");
    expect(ruleFor("Excessive Heat Warning")).toBe("heat");
    expect(ruleFor("Rip Current Statement")).toBeNull();
  });
  it("hurricane watch: urgent, safety first, the six pre-storm tasks", () => {
    const r = alertTasks({ event: "Hurricane Watch", onset: "2026-09-12T12:00:00Z" }, yard)!;
    expect(r.priority).toBe("urgent");
    expect(r.tasks[0]).toMatchObject({ kind: "safety", title: SAFETY_LINE });
    expect(titles(r).join("|")).toMatch(/Stake young trees.*Live Oak/);
    expect(titles(r)).toEqual(expect.arrayContaining(["Move pots and hanging baskets inside", "Harvest ripe Tomato now", "Pause irrigation until the storm passes", "Don't fertilize or prune now"]));
    expect(titles(r).some((t) => /secure loose/i.test(t))).toBe(false);
    // Due 24 h before onset.
    expect(r.tasks[1].due_at).toBe("2026-09-11T12:00:00.000Z");
  });
  it("hurricane warning: due within hours plus 'secure loose garden items'", () => {
    const r = alertTasks({ event: "Hurricane Warning", onset: "2026-09-11T02:00:00Z" }, yard)!;
    expect(titles(r).some((t) => /Secure loose garden items/.test(t))).toBe(true);
    expect(r.tasks[1].due_at).toBe("2026-09-10T20:00:00.000Z");
    expect(r.pauses_water).toBe(true);
  });
  it("never schedules a garden task after onset (before the storm only)", () => {
    const onset = "2026-09-10T18:00:00.000Z";
    const r = alertTasks({ event: "Hurricane Warning", onset }, yard)!;
    for (const t of r.tasks.filter((x) => x.kind !== "followup")) expect(Date.parse(t.due_at)).toBeLessThanOrEqual(Date.parse(onset));
  });
  it("flood: pause irrigation, containers up, low beds, no fertilizer, check after", () => {
    const r = alertTasks({ event: "Flash Flood Warning", ends: "2026-09-11T06:00:00Z" }, yard)!;
    expect(r.priority).toBe("urgent");
    expect(titles(r).slice(1)).toEqual(["Pause irrigation", "Move containers to higher ground", expect.stringMatching(/low beds/), expect.stringMatching(/Don't fertilize/), expect.stringMatching(/standing water/)]);
    expect(r.tasks.at(-1)!.due_at).toBe("2026-09-11T06:00:00Z");
  });
  it("heavy rain: normal priority, no safety line, adds barrel and rain garden notes", () => {
    const r = alertTasks({ event: "Heavy rain" }, { ...yard, barrel_gal: 165, barrel_fill_gal: 400, rain_garden_gal: 690 })!;
    expect(r.priority).toBe("normal");
    expect(r.tasks[0].kind).not.toBe("safety");
    expect(titles(r)).toEqual(expect.arrayContaining(["Your rain barrel should fill (about 165 gal)", "Your rain garden can hold about 690 gal of runoff"]));
  });
  it("severe thunderstorm: pots in and nothing else outdoors", () => {
    expect(titles(alertTasks({ event: "Severe Thunderstorm Warning" }, yard))).toEqual([SAFETY_LINE, "Bring in pots and light items", "Nothing else outdoors until the storm passes"]);
  });
  it("wind advisory: normal, stake tall plants and move pots", () => {
    const r = alertTasks({ event: "Wind Advisory" }, yard)!;
    expect(r.priority).toBe("normal");
    expect(titles(r)).toEqual(["Stake tall plants: Firebush", "Move pots against a wall or inside"]);
  });
  it("freeze: frost tasks with the plant names, county safety line", () => {
    const r = alertTasks({ event: "Freeze Warning", onset: "2026-01-10T05:00:00Z" }, { ...yard, now: "2026-01-09T15:00:00Z" })!;
    expect(r.tasks[0].title).toBe(FREEZE_SAFETY);
    expect(titles(r).join("|")).toMatch(/Water the soil in the afternoon.*Cover tender plants.*Basil.*Remove covers/);
  });
  it("heat: water edibles early, shade seedlings", () => {
    const r = alertTasks({ event: "Heat Advisory" }, { ...yard, edibles: ["Tomato"] })!;
    expect(titles(r)).toEqual(["Water edibles early in the morning: Tomato", "Shade seedlings in the afternoon"]);
  });
});

describe("balcony", () => {
  const bal = { now, balcony: true };
  it("wind, tropical and severe storm alerts always start with bring every pot inside (after the safety line)", () => {
    for (const ev of ["Hurricane Warning", "Tropical Storm Watch", "Severe Thunderstorm Warning", "High Wind Warning"]) {
      const r = alertTasks({ event: ev }, bal)!;
      expect(r.tasks[0].title, ev).toBe(SAFETY_LINE);
      expect(r.tasks[1].title, ev).toBe(BRING_INSIDE);
    }
  });
  it("heavy rain adds empty saucers", () => {
    expect(titles(alertTasks({ event: "Heavy rain" }, bal))).toContain(EMPTY_SAUCERS);
  });
});

describe("pipeline helpers", () => {
  it("heavy-rain threshold: 50 mm in the next 24 h", () => {
    const hourly = (mm: number) => Array.from({ length: 48 }, (_, i) => ({ time: new Date(Date.parse(now) + i * 3600e3).toISOString(), precip_mm: mm }));
    expect(rainNext24h(hourly(2), now)).toBeCloseTo(48, 6);
    expect(isHeavyRain(hourly(2), now)).toBe(false);
    expect(isHeavyRain(hourly(2.1), now)).toBe(true);
  });
  it("dedupe key: same id + sent is the same alert; a new sent time is an update", () => {
    expect(dedupeKey("urn:oid:1", "2026-09-10T10:00:00Z")).toBe(dedupeKey("urn:oid:1", "2026-09-10T10:00:00Z"));
    expect(dedupeKey("urn:oid:1", "2026-09-10T10:00:00Z")).not.toBe(dedupeKey("urn:oid:1", "2026-09-10T16:00:00Z"));
  });
  it("fertilizer task inside an active alert moves to 2 days after it ends", () => {
    const tasks = [
      { id: "fert:tomato:1", kind: "fertilize", due_at: "2026-09-11", detail: "Feed." },
      { id: "plant:lettuce", kind: "plant", due_at: "2026-09-11", detail: "" },
      { id: "fert:basil:1", kind: "fertilize", due_at: "2026-09-30", detail: "Feed." },
    ];
    const r = moveFertilizer(tasks, [{ event: "Hurricane Warning", onset: "2026-09-10T18:00:00Z", ends: "2026-09-12T12:00:00Z" }], now);
    expect(r.moved).toEqual(["fert:tomato:1"]);
    expect(r.tasks[0].due_at).toBe("2026-09-14");
    expect(r.tasks[0].detail).toMatch(/Moved because of the Hurricane Warning/);
    expect(r.tasks[2].due_at).toBe("2026-09-30");
  });
  it("heavy rain blocks fertilizer for 48 h after", () => {
    const r = moveFertilizer([{ id: "f", kind: "fertilize", due_at: "2026-09-12", detail: "" }], [{ event: "Heavy rain", ends: "2026-09-11T00:00:00Z" }], now);
    expect(r.moved).toEqual(["f"]);
  });
  it("pauses watering for rain, flood and tropical alerts only", () => {
    expect(pausesWater("Flood Watch")).toBe(true);
    expect(pausesWater("Hurricane Warning")).toBe(true);
    expect(pausesWater("Heat Advisory")).toBe(false);
    expect(pausesWater("Freeze Warning")).toBe(false);
  });
  it("follow-up tasks after an alert ends", () => {
    expect(followUpTasks({ event: "Hurricane Warning" }, now, false).map((t) => t.title).join("|")).toMatch(/damage.*standing water.*photo check-in/);
    expect(followUpTasks({ event: "Heat Advisory" }, now, false)).toEqual([]);
  });
  it("tropical storms within 500 km are context only", () => {
    const storms = [{ id: "al1", name: "Alpha", classification: "TS", lat: 26.0, lon: -84.0, intensity_kt: 50, url: null }, { id: "al2", name: "Beta", classification: "HU", lat: 15, lon: -50, intensity_kt: 90, url: null }];
    const near = nearbyStorms(storms, 27.95, -82.46);
    expect(near.map((s) => s.name)).toEqual(["Alpha"]);
    expect(near[0].distance_km).toBeLessThan(500);
  });
});
