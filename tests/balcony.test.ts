/** Phase 11.5 balcony mode: sun hours, container water, weight, wind alerts, picks and shopping. */
import { describe, expect, it } from "vitest";

import ediblesJson from "../data/edibles.json";
import linh from "../data/demo/linh.json";
import plantsJson from "../data/plants.json";
import { BRING_INSIDE, EMPTY_SAUCERS, SAFETY_LINE, balconyAlertTasks, balconyShopping, balconyStarter, isBalconyWindAlert } from "../lib/engine/balcony";
import { balconyLight, directSun, litDepth, sunHours, sunStrip, sunSummary, typicalPotD } from "../lib/engine/balconySun";
import { availableWaterL, daysBetweenWatering, intervalText, potDiameterIn, potPlan } from "../lib/engine/containerWater";
import { recommend } from "../lib/engine/recommend";
import { sunPosition } from "../lib/engine/sunpos";
import { balconyWeight, potWeightKg } from "../lib/engine/weight";
import type { Plant, SiteInput, StarterAnswers } from "../lib/types";

const PLANTS = [...(plantsJson as unknown as Plant[]), ...(ediblesJson.plants as unknown as Plant[])];
const byId = new Map(PLANTS.map((p) => [p.id, p]));
const TAMPA = { lat: 27.95, lon: -82.46 };
const open = (facing: number) => ({ facing_deg: facing, balcony_w_ft: 5, overhang_depth_ft: 0, overhang_height_ft: 8.5 });
const LINH = linh.site as unknown as SiteInput;

describe("sun position", () => {
  it("Tampa noon altitude on the December solstice is about 38.6°", () => {
    // Solar noon in Tampa is about 12:30 EST = 17:30 UTC.
    const s = sunPosition(Date.UTC(2026, 11, 21, 17, 30), TAMPA.lat, TAMPA.lon);
    expect(s.altitude_deg).toBeGreaterThan(37.5);
    expect(s.altitude_deg).toBeLessThan(39.5);
    expect(Math.abs(s.azimuth_deg - 180)).toBeLessThan(8);
  });
});

describe("balcony sun hours", () => {
  it("an open south balcony gets far more sun than a north one", () => {
    const south = sunStrip(TAMPA.lat, TAMPA.lon, open(180), 2.5);
    const north = sunStrip(TAMPA.lat, TAMPA.lon, open(0), 2.5);
    // Winter sun stays in front of a south balcony all day; in June it rises and sets north of east and west.
    expect(south[11]).toBeGreaterThanOrEqual(8);
    expect(south[5]).toBeLessThan(south[11]);
    expect(south.reduce((a, b) => a + b)).toBeGreaterThan(3 * north.reduce((a, b) => a + b));
    expect(north[5]).toBeGreaterThan(north[0]); // early morning and evening sun reach a north balcony in June
    expect(north[0]).toBe(0); // no direct sun on a north balcony in January
    expect(balconyLight(south)).toBe("full_sun");
  });

  it("a deep overhang on a south balcony blocks the high June sun but not the low December sun", () => {
    const g = { facing_deg: 180, balcony_w_ft: 8, overhang_depth_ft: 8, overhang_height_ft: 8 };
    expect(sunHours(TAMPA.lat, TAMPA.lon, g, 6, 4)).toBe(0);
    expect(sunHours(TAMPA.lat, TAMPA.lon, g, 12, 4)).toBeGreaterThan(6);
  });

  it("the sun must be in front of the balcony (within 90° of the facing)", () => {
    expect(directSun(open(270), 2.5, 1.5, 90, 40)).toBe(false); // morning sun behind a west balcony
    expect(directSun(open(270), 2.5, 1.5, 260, 40)).toBe(true);
    expect(directSun(open(270), 2.5, 1.5, 260, 3)).toBe(false); // too low (< 5°)
  });

  it("Linh's west balcony under the upstairs balcony gets 4 to 5 h of afternoon sun", () => {
    const strip = sunStrip(LINH.lat, LINH.lon, LINH, typicalPotD(LINH));
    expect(Math.min(...strip)).toBeGreaterThanOrEqual(3.5);
    expect(Math.max(...strip)).toBeLessThanOrEqual(5.5);
    expect(balconyLight(strip)).toBe("partial_shade");
    expect(sunSummary(270, strip)).toMatch(/^West balcony: .*afternoon sun/);
  });

  it("lit floor depth is 0 when the sun is behind the wall and the full depth when it is low in front", () => {
    expect(litDepth(open(270), 90, 30)).toBe(0);
    expect(litDepth(open(270), 270, 10)).toBe(5);
  });
});

describe("container water", () => {
  it("days between watering = 0.5 × available water / daily use", () => {
    // 5 gal: AW = 5 × 3.785 × 0.25 = 4.73 L; use = 1.0 × 5 mm × 0.5 m² = 2.5 L/day → 0.95 days
    expect(availableWaterL(5)).toBeCloseTo(4.73, 2);
    expect(daysBetweenWatering(5, 1, 5, 0.5, false)).toBeCloseTo(0.946, 2);
    // A hot west wall uses 20% more, so less time between waterings.
    expect(daysBetweenWatering(5, 1, 5, 0.5, true)).toBeCloseTo(0.946 / 1.2, 2);
  });

  it("bigger pots go longer between waterings", () => {
    expect(daysBetweenWatering(10, 1, 5, 0.5, false)).toBeCloseTo(2 * daysBetweenWatering(5, 1, 5, 0.5, false), 6);
  });

  it("a cherry tomato in a 5 gal pot on a west balcony needs water daily in summer", () => {
    const plan = potPlan(byId.get("cherry_tomato")!, 5, 270);
    expect(plan.summer_days).toBeLessThan(1.5);
    expect(plan.winter_days).toBeGreaterThan(plan.summer_days);
    expect(plan.summary).toMatch(/^water daily/);
  });

  it("interval text", () => {
    expect(intervalText(0.4)).toMatch(/daily, twice/);
    expect(intervalText(1)).toBe("daily");
  });

  it("pot diameter grows with the cube root of volume", () => {
    expect(potDiameterIn(1)).toBeCloseTo(6.6, 1);
    expect(potDiameterIn(8)).toBeCloseTo(13.2, 1);
  });
});

describe("balcony weight", () => {
  it("adds wet mix, pot and saucer water per gallon", () => {
    // 1 gal = 3.785 kg mix + 0.3 kg pot + 0.2 kg saucer water
    expect(potWeightKg(1)).toBeCloseTo(4.285, 3);
    const w = balconyWeight([5, 5, 3, 1]);
    expect(w.kg).toBe(Math.round(14 * 4.285));
    expect(w.lb).toBe(Math.round(14 * 4.285 * 2.20462));
    expect(w.pots).toBe(4);
    expect(w.over_threshold).toBe(false);
  });

  it("never says the balcony is safe, and flags heavy totals", () => {
    const light = balconyWeight([1]);
    expect(light.note).not.toMatch(/\bsafe\b/i);
    const heavy = balconyWeight(Array(10).fill(15));
    expect(heavy.over_threshold).toBe(true);
    expect(heavy.note).toMatch(/building manager/);
  });
});

describe("balcony wind alerts", () => {
  it("puts Bring every pot inside first, with the safety line, for hurricanes and storms", () => {
    for (const ev of ["Hurricane Warning", "Tropical Storm Watch", "High Wind Warning", "Severe Thunderstorm Warning"]) {
      const t = balconyAlertTasks(ev);
      expect(isBalconyWindAlert(ev)).toBe(true);
      expect(t.tasks[0]).toBe(BRING_INSIDE);
      expect(t.tasks[0]).toMatch(/^Bring every pot/);
      expect(t.safety).toBe(SAFETY_LINE);
    }
    expect(balconyAlertTasks("Hurricane Warning").tasks).toContain(EMPTY_SAUCERS);
  });

  it("heavy rain adds the empty saucers task; frost adds nothing", () => {
    expect(balconyAlertTasks("Flood Watch").tasks).toContain(EMPTY_SAUCERS);
    expect(balconyAlertTasks("Freeze Warning").tasks).toEqual([]);
  });
});

describe("balcony picks", () => {
  it("only container plants, and a sun lover is told to go at the railing", () => {
    const r = recommend(LINH, PLANTS, "wildlife");
    for (const s of [...r.natives, ...r.edibles]) expect(s.plant.container_ok).toBe(true);
    const tomato = r.edibles.find((s) => s.plant.id === "cherry_tomato")!;
    expect(tomato.reasons.join(" ")).toMatch(/railing/);
  });

  it("floor 10+ drops plants that hate wind; floor 4 only lowers them", () => {
    const low = PLANTS.find((p) => p.container_ok && p.wind_tolerance === "low")!;
    const at = (floor: number) => recommend({ ...LINH, floor_level: floor }, PLANTS, null);
    const ids = (floor: number) => [...at(floor).natives, ...at(floor).edibles].map((s) => s.plant.id);
    expect(ids(4)).toContain(low.id);
    expect(ids(10)).not.toContain(low.id);
  });

  it("Linh's starter: cherry tomato and basil in pots, with tropical sage for pollinators", () => {
    const a = { ...linh.garden.starter, budget_usd: null, target_harvest: null } as unknown as StarterAnswers;
    const plan = balconyStarter(a, LINH, PLANTS, "2026-11-21");
    expect(plan.crops.slice(0, 2)).toEqual(["cherry_tomato", "basil"]);
    expect(plan.pollinators).toContain("salvia_coccinea");
    for (const p of plan.placements) {
      expect(p.y_ft).toBeLessThanOrEqual(5);
      expect(p.x_ft).toBeLessThanOrEqual(10);
    }
  });

  it("shopping: one pot per plant by size, potting mix bags, saucers when dripping is banned", () => {
    const lines = balconyShopping(linh.placements.map((p) => ({ plant_id: p.plant_id, container_gal: p.gal, mount: p.mount as "floor" })), byId, LINH.rules);
    const item = (re: RegExp) => lines.find((l) => re.test(l.item));
    expect(item(/5 gal pot/)!.qty).toBe(2);
    expect(item(/potting mix/i)!.volume_ft3).toBeGreaterThan(0);
    expect(item(/^Saucers/)).toBeTruthy();
  });
});
