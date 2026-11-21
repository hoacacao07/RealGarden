/** Phase 11 tests: raised bed volume and bags, back-calculated planting date, stage Kc, fertilizer window, soil plan. */
import { describe, expect, it } from "vitest";

import ediblesJson from "../data/edibles.json";
import plantsJson from "../data/plants.json";
import { harvestWindow, inWindow, nextPlantingDate, plantDateForHarvest, stageKc } from "../lib/engine/edibles";
import { impact } from "../lib/engine/impact";
import { recommend } from "../lib/engine/recommend";
import { bagsFor, bedVolumeFt3, ft3ToYd3, shoppingList, toCsv } from "../lib/engine/shopping";
import { edibleSoilPlan, nativeSoilPlan } from "../lib/engine/soilplan";
import { starterPlan } from "../lib/engine/starter";
import { fertRuleFor, inRestricted, moveOutOfRestricted, planCrops, taskCalendar } from "../lib/engine/tasks";
import type { Plant, SiteInput } from "../lib/types";

const PLANTS = plantsJson as unknown as Plant[];
const EDIBLES = ediblesJson.plants as unknown as Plant[];
const ALL = [...PLANTS, ...EDIBLES];
const ed = (id: string) => EDIBLES.find((p) => p.id === id)!;
const tomato = ed("tomato");

describe("raised bed volume and bags", () => {
  // 8 × 4 ft × 10 in: V = 8·4·10/12 = 26.667 ft³ = 0.988 yd³; bags of 1.5 ft³ = ceil(17.78) = 18.
  it("volume, yards, bags", () => {
    const v = bedVolumeFt3({ l_ft: 8, w_ft: 4, depth_in: 10 });
    expect(v).toBeCloseTo(26.667, 3);
    expect(ft3ToYd3(v)).toBeCloseTo(0.9877, 4);
    expect(bagsFor(v)).toBe(18);
    expect(bagsFor(v, 2)).toBe(14); // 13.33 → 14
  });
  it("exact multiples don't round up", () => expect(bagsFor(3, 1.5)).toBe(2));
  it("1:1:1 mix splits the volume in thirds", () => {
    const lines = shoppingList({ placed: [], landscapeAreaSqft: 0, raisedBeds: [{ l_ft: 8, w_ft: 4, depth_in: 10 }], inGroundEdibleAreaSqft: 0, hasEdibles: false, mix: "1:1:1" });
    // third = 8.889 ft³ → 6 bags of 1.5 ft³ each
    expect(lines.filter((l) => l.category === "soil").map((l) => l.qty)).toEqual([6, 6, 6]);
  });
  it("mulch is landscape area × 3 in; fertilizer only with edibles; no prices invented", () => {
    // 200 sq ft × 3 in = 50 ft³ → 25 bags of 2 ft³
    const lines = shoppingList({ placed: [tomato, tomato, PLANTS[0]], landscapeAreaSqft: 200, raisedBeds: [], inGroundEdibleAreaSqft: 0, hasEdibles: false });
    expect(lines.find((l) => l.id === "mulch")!.qty).toBe(25);
    expect(lines.some((l) => l.category === "fertilizer")).toBe(false);
    expect(lines.find((l) => l.id === "plant:tomato")!.qty).toBe(2);
    expect(toCsv(lines)).not.toMatch(/\$/);
  });
});

describe("edible dates", () => {
  it("planting windows wrap the new year", () => {
    expect(inWindow(1, [[8, 3]])).toBe(true);
    expect(inWindow(6, [[8, 3]])).toBe(false);
  });
  // Target harvest Jun 15 2027, days_to_harvest max 85 → plant Mar 22 2027 (central window Jan–Mar: inside).
  it("back-calculates the planting date", () => {
    expect(plantDateForHarvest(tomato.edible!, "2027-06-15", tomato.edible!.planting_windows.central)).toEqual({ date: "2027-03-22", in_window: true });
  });
  it("flags a date outside the window", () => {
    // Harvest Sep 1 → plant Jun 8, outside central windows.
    expect(plantDateForHarvest(tomato.edible!, "2027-09-01", tomato.edible!.planting_windows.central).in_window).toBe(false);
  });
  it("next planting date", () => {
    expect(nextPlantingDate([[1, 3], [8, 9]], "2026-11-21")).toBe("2027-01-01");
    expect(nextPlantingDate([[1, 3], [8, 9]], "2026-02-10")).toBe("2026-02-10");
  });
  // Harvest from Mar 1: start +60 = Apr 30; end +85 + 6·7 = +127 = Jul 6.
  it("harvest window", () => expect(harvestWindow(tomato.edible!, "2027-03-01")).toEqual({ start: "2027-04-30", end: "2027-07-06" }));
});

describe("stage Kc (FAO-56)", () => {
  // Tomato: ini 0.6, mid 1.15, end 0.8, stages 30/40/40/25.
  const e = tomato.edible!;
  it("initial", () => expect(stageKc(e, 10)).toEqual({ kc: 0.6, stage: "initial" }));
  // day 50: 20 of 40 into development → 0.6 + 0.5·0.55 = 0.875
  it("development is linear", () => expect(stageKc(e, 50).kc).toBeCloseTo(0.875, 6));
  it("mid season", () => expect(stageKc(e, 90)).toEqual({ kc: 1.15, stage: "mid" }));
  // day 122.5: 12.5 of 25 into late → 1.15 − 0.5·0.35 = 0.975
  it("late season", () => expect(stageKc(e, 122.5).kc).toBeCloseTo(0.975, 6));
  it("after the season", () => expect(stageKc(e, 200)).toEqual({ kc: 0.8, stage: "done" }));
});

describe("fertilizer restricted window", () => {
  const rule = fertRuleFor(27.95, -82.46); // Tampa
  it("picks the city rule over the county", () => expect(rule.id).toBe("tampa"));
  it("falls back to the default elsewhere", () => expect(fertRuleFor(30.4, -84.3).id).toBe("default"));
  it("detects dates inside Jun 1 to Sep 30", () => {
    expect(inRestricted("2027-06-01", rule)).toBe(true);
    expect(inRestricted("2027-09-30", rule)).toBe(true);
    expect(inRestricted("2027-10-01", rule)).toBe(false);
  });
  it("moves to the nearest allowed day", () => {
    expect(moveOutOfRestricted("2027-06-10", rule)).toEqual({ date: "2027-05-31", moved: true });
    expect(moveOutOfRestricted("2027-09-01", rule)).toEqual({ date: "2027-10-01", moved: true });
    expect(moveOutOfRestricted("2027-03-01", rule)).toEqual({ date: "2027-03-01", moved: false });
  });
  it("never moves before planting", () => expect(moveOutOfRestricted("2027-06-10", rule, "2027-06-05").date).toBe("2027-10-01"));
  it("calendar fertilizer tasks avoid the window and say why", () => {
    // Central tomato planted Aug 15 (window Aug–Sep): fertilizer at planting moves to Oct 1.
    const crops = planCrops([{ plant: tomato, count: 3, planted_on: "2027-08-15" }], "central", "2027-08-01", null);
    const tasks = taskCalendar({ today: "2027-08-01", region: "central", crops, soil: [edibleSoilPlan({ soil: "sand", drainage: "fast", region: "central", is_fill: true })], rule, hasLandscape: false });
    const fert = tasks.filter((t) => t.kind === "fertilize");
    expect(fert.length).toBeGreaterThan(0);
    expect(fert.every((t) => !inRestricted(t.due_at, rule))).toBe(true);
    expect(fert[0].due_at).toBe("2027-10-01");
    expect(fert[0].detail).toMatch(/Moved from Aug 15/);
    expect(tasks[0].title).toBe("Check your local fertilizer ordinance");
  });
  it("prep tasks come before the first planting", () => {
    const crops = planCrops([{ plant: tomato, count: 2 }], "central", "2026-11-21", null);
    expect(crops[0].plant_on).toBe("2027-01-01");
    const tasks = taskCalendar({ today: "2026-11-21", region: "central", crops, soil: [edibleSoilPlan({ soil: "sand", drainage: "fast", region: "central", is_fill: true })], rule, hasLandscape: true });
    const prep = tasks.filter((t) => t.kind === "prep");
    expect(prep.map((t) => t.id)).toEqual(expect.arrayContaining(["prep:build-bed", "prep:fill-bed", "prep:mulch"]));
    expect(prep.every((t) => t.due_at < "2027-01-01")).toBe(true);
  });
});

describe("soil plan", () => {
  const base = { soil: "sand" as const, drainage: "fast" as const, region: "central" as const };
  it("natives use existing soil; fill → loosen", () => {
    expect(nativeSoilPlan(base).decision).toBe("use_existing");
    expect(nativeSoilPlan({ ...base, is_fill: true }).decision).toBe("loosen_amend");
  });
  it("good pH, not fill → in ground with compost", () => expect(edibleSoilPlan({ ...base, ph: 6.2, soil_source: "survey" }).decision).toBe("in_ground_compost"));
  it("pH out of range → raised bed", () => expect(edibleSoilPlan({ ...base, ph: 7.6, soil_source: "lab" }).decision).toBe("raised_bed"));
  it("unknown + very sandy (Maria) → raised bed", () => {
    const p = edibleSoilPlan({ ...base, soil_source: "unknown", sand_pct: 97.9, ph: 5 });
    expect(p.decision).toBe("raised_bed");
    expect(p.reasons.length).toBeGreaterThanOrEqual(1);
    expect(p.reasons.length).toBeLessThanOrEqual(2);
  });
  it("limestone → raised bed", () => expect(edibleSoilPlan({ ...base, region: "south", ph: 7.9, soil_source: "survey" }).decision).toBe("raised_bed"));
  it("containers → potting mix", () => expect(edibleSoilPlan(base, { containers: true }).decision).toBe("potting_mix"));
});

describe("edibles in the recommender and native %", () => {
  const site: SiteInput = { lat: 27.93, lon: -82.5, region: "central", sun: "full_sun", soil: "sand", drainage: "fast", coastal_distance_mi: 2, area_sqft: 640 };
  it("edibles are listed separately, never as natives or non-natives", () => {
    const r = recommend(site, ALL, "wildlife");
    expect(r.edibles.length).toBeGreaterThan(5);
    expect([...r.natives, ...r.nonNatives].some((s) => s.plant.origin === "edible")).toBe(false);
  });
  it("edibles never count toward native %", () => {
    const sage = PLANTS.find((p) => p.id === "salvia_coccinea")!;
    expect(impact([sage, sage, tomato, tomato, tomato], 0).native_pct.by_count).toBe(100);
  });
  it("starter plan: native zone, raised edible bed with tomato first, pollinator natives next to it", () => {
    const plan = starterPlan({ goals: ["butterflies", "food"], hours_week: "2-4", budget_usd: null, space: "yard", target_harvest: null },
      { ...site, soil_source: "unknown", sand_pct: 97.9 }, ALL, "2026-11-21");
    const edibleZone = plan.zones.find((z) => z.kind === "edible")!;
    expect(edibleZone.bed).toBe("raised");
    expect(plan.crops[0]).toBe("tomato");
    expect(plan.pollinators.length).toBeGreaterThanOrEqual(2);
    expect(plan.placements.filter((p) => p.zone_id === "z_edible").every((p) => ALL.find((x) => x.id === p.plant_id)!.origin === "edible")).toBe(true);
  });
});
