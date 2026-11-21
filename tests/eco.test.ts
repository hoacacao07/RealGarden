import { describe, expect, it } from "vitest";

import maria from "../data/demo/maria.json";
import { isBlocked } from "../lib/catalog";
import { PLANTS } from "../lib/catalog-data";
import { carbon, seqAt, seqMature } from "../lib/engine/eco/carbon";
import { C, galPerMmSqft, inchesToGallons, mmToGallons } from "../lib/engine/eco/coef";
import { typicalYear } from "../lib/engine/eco/climate";
import { food, pollinators } from "../lib/engine/eco/nature";
import { rainGardenGal, roofInflowGal, simulateBarrel, stormwater, suggestRainGarden } from "../lib/engine/eco/rain";
import { applySwap, ecoReport, ecoScore, gradeFor, greenerSwaps, lawnYard } from "../lib/engine/eco/report";
import { shadeTier, wallShadeHours } from "../lib/engine/eco/shade";
import { heightAt, mean } from "../lib/engine/growth";
import { EMPTY_ECO, type EcoLayer, type GardenDoc } from "../lib/types";

const P = (id: string) => PLANTS.find((p) => p.id === id)!;
const today = "2026-11-21";
const ago = (d: number) => new Date(Date.parse(today) - d * 86400e3).toISOString().slice(0, 10);

type MariaJson = { site: GardenDoc["site"]; zones: GardenDoc["zones"]; placements: { plant_id: string; zone?: string; x_ft: number; y_ft: number; days_ago: number }[] };
const m = maria as unknown as MariaJson;
const garden = (): GardenDoc => ({
  id: "maria", name: "Maria", theme: "wildlife", planted_on: ago(420), canvas_w_ft: 32, canvas_h_ft: 20, is_demo: true, updated_at: "",
  starter: { goals: [], hours_week: null, budget_usd: null, space: "yard", target_harvest: null, themes: ["butterfly"], prefer_natives: "some", hardiness_zone: "10a" },
  site: { ...m.site }, zones: m.zones,
  placements: m.placements.map((p, i) => ({ id: `p${i}`, plant_id: p.plant_id, zone_id: p.zone ?? null, x_ft: p.x_ft, y_ft: p.y_ft, planted_on: ago(p.days_ago) })),
});
const ECO: EcoLayer = { ...EMPTY_ECO, house: { x: 2, y: -32, w: 28, h: 28 }, surfaces: [{ kind: "driveway", sqft: 400 }, { kind: "path", sqft: 60 }], lawn_sqft: 900, household: 3 };

describe("units", () => {
  it("1 in over 1 sq ft = 0.623 gal; 1 mm ≈ 0.0245 gal", () => {
    expect(inchesToGallons(1, 1)).toBeCloseTo(0.623, 3);
    expect(galPerMmSqft()).toBeCloseTo(0.0245, 4);
    expect(mmToGallons(25.4, 100)).toBeCloseTo(62.3, 1);
  });
  it("typical year has 365 days and the monthly rain totals", () => {
    const y = typicalYear();
    expect(y).toHaveLength(365);
    const june = y.filter((d) => d.month === 6).reduce((s, d) => s + d.rain_mm, 0);
    expect(june / 25.4).toBeCloseTo(6.8, 5);
  });
});

describe("rain barrel", () => {
  it("overflows when inflow beats capacity", () => {
    const r = simulateBarrel(50, [80, 0, 0], [0, 10, 10]);
    expect(r.overflow_days).toBe(1);
    expect(r.overflow_gal).toBe(30);
    expect(r.used_gal).toBe(20);
    expect(r.captured_gal).toBe(50);
  });
  it("runs empty when demand beats storage, and never uses water it doesn't have", () => {
    const r = simulateBarrel(50, [20, 0, 0, 0], [5, 10, 10, 10]);
    expect(r.used_gal).toBe(20);
    expect(r.empty_days).toBe(2);
  });
  it("inflow uses roof area × rain × 0.623 × efficiency above the first flush", () => {
    const [v] = roofInflowGal(1000, [{ month: 6, rain_mm: 25.4, et0_mm: 0 }]);
    expect(v).toBeCloseTo(1000 * (1 - C("first_flush_in")) * 0.623 * C("roof_collection_efficiency"), 3);
  });
});

describe("stormwater and rain garden", () => {
  it("rain garden capacity and sizing formula", () => {
    const d = C("rain_garden_pond_ft"), D = C("rain_garden_soil_ft"), n = C("rain_garden_porosity");
    expect(rainGardenGal(100)).toBeCloseTo((100 * d + 100 * D * n) * 7.48, 3);
    // A_rg = C·P·A / (d + D·n) for a 1 in storm on 1,000 sq ft of roof (C = 0.95).
    expect(suggestRainGarden([{ kind: "roof", sqft: 1000 }], 1)).toBeCloseTo((0.95 * (1 / 12) * 1000) / (d + D * n), 6);
  });
  it("a rain garden sized by the formula keeps the roof's design storm on site", () => {
    const a = suggestRainGarden([{ kind: "roof", sqft: 1000 }], 1);
    const s = stormwater([{ kind: "roof", sqft: 1000 }], 0, a, 1);
    expect(s.leaving_gal).toBeLessThan(1);
  });
});

describe("carbon", () => {
  it("scales with (h(t)/H)²", () => {
    const oak = P("quercus_virginiana");
    const H = mean(oak.mature_height_ft);
    expect(seqAt(oak, 5)).toBeCloseTo(seqMature(oak) * (heightAt(oak, 5) / H) ** 2, 6);
    expect(seqAt(oak, 1)).toBeLessThan(seqAt(oak, 10));
    expect(seqMature(P("lettuce"))).toBe(0);
  });
  it("10-year total includes avoided mowing", () => {
    const c = carbon([], 1000);
    expect(c.kg_10yr).toBeCloseTo(10 * C("mowing_kg_co2_per_1000sqft_yr"), 6);
    expect(c.miles_10yr).toBeCloseTo(c.kg_10yr / C("kg_co2_per_mile"), 6);
  });
});

describe("shade", () => {
  const house = { x: 20, y: 20, w: 20, h: 20 };
  it("a big tree just west of a box house shades the west wall on summer afternoons", () => {
    const tree = { id: "oak", x_ft: 12, y_ft: 30, radius_ft: 12, height_ft: 35 };
    const h = wallShadeHours([tree], house, 27.95, -82.46);
    expect(h.west).toBeGreaterThan(1);
    expect(shadeTier(h.total)).not.toBe("low");
  });
  it("the same tree on the east side gives no afternoon wall shade", () => {
    const h = wallShadeHours([{ id: "oak", x_ft: 52, y_ft: 30, radius_ft: 6, height_ft: 20 }], house, 27.95, -82.46);
    expect(h.west).toBe(0);
  });
});

describe("eco score", () => {
  it("weights from config, missing metrics re-weighted", () => {
    const w = C("eco_score_weights") as Record<string, number>;
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(ecoScore({ water: 100, pollinators: 50 })).toBe(Math.round((w.water * 100 + w.pollinators * 50) / (w.water + w.pollinators)));
    expect(ecoScore({ water: 80, rain: null })).toBe(80);
    expect(gradeFor(90)).toBe("A");
    expect(gradeFor(10)).toBe("F");
  });
  it("Maria: rain barrel then lawn-to-pollinator-bed raises the grade to A (demo story)", () => {
    let g = garden();
    let eco = ECO;
    const start = ecoReport({ garden: g, plants: PLANTS, eco, today });
    expect(start.grade).not.toBe("A");
    for (const kind of ["barrel", "convert_lawn"] as const) {
      const sw = greenerSwaps({ garden: g, plants: PLANTS, eco, today });
      const s = sw.find((x) => x.action.type === kind)!;
      expect(s, kind).toBeTruthy();
      expect(s.delta).toBeGreaterThan(0);
      ({ garden: g, eco } = applySwap(g, eco, s.action));
    }
    expect(ecoReport({ garden: g, plants: PLANTS, eco, today }).grade).toBe("A");
  });
  it("beats a typical lawn yard of the same size", () => {
    const x = { garden: garden(), plants: PLANTS, eco: ECO, today };
    expect(ecoReport(x).water.design_gal).toBeLessThan(lawnYard(x).water.design_gal);
    expect(ecoReport(x).score).toBeGreaterThan(lawnYard(x).score);
  });
  it("without a house, house metrics are left out instead of scored 0", () => {
    const r = ecoReport({ garden: garden(), plants: PLANTS, eco: EMPTY_ECO, today });
    expect(r.metrics.find((x) => x.id === "rain")!.score).toBeNull();
    expect(r.metrics.find((x) => x.id === "shade")!.score).toBeNull();
    expect(r.has_house).toBe(false);
  });
});

describe("swaps", () => {
  it("never suggest invasive plants", () => {
    const g = garden();
    // Put every non-invasive and invasive non-native in the yard: swaps must only ever point to non-invasive plants.
    g.placements.push(...["lantana_camara", "ruellia_simplex", "hibiscus_rosa_sinensis", "ixora_coccinea", "hydrangea", "rose_knock_out"].map((id, i) => ({ id: `x${i}`, plant_id: id, zone_id: "zone_maria_bed", x_ft: 3 + i * 2, y_ft: 5, planted_on: ago(100) })));
    const sw = greenerSwaps({ garden: g, plants: PLANTS, eco: ECO, today });
    for (const s of sw) {
      if (s.action.type === "replace_plant") expect(isBlocked(P(s.action.to))).toBe(false);
      if (s.action.type === "add_plant") expect(isBlocked(P(s.action.plant_id))).toBe(false);
    }
    expect(sw.length).toBeLessThanOrEqual(3);
  });
  it("adds a host plant when there are nectar plants but no host plant", () => {
    const g = garden();
    g.placements = g.placements.filter((p) => !["asclepias_tuberosa", "passiflora_incarnata", "zamia_integrifolia", "stachytarpheta_jamaicensis"].includes(p.plant_id));
    expect(pollinators(g.placements.map((p) => P(p.plant_id))).host).toBe(0);
    const sw = greenerSwaps({ garden: g, plants: PLANTS, eco: EMPTY_ECO, today });
    expect(sw.some((s) => s.action.type === "add_plant")).toBe(true);
  });
});

describe("food", () => {
  it("harvest from yield per 10 ft of row; compost share of the beds' need", () => {
    const f = food([{ plant: P("tomato"), age_years: 0 }, { plant: P("tomato"), age_years: 0 }], 32, 3, true);
    expect(f.lb_season).toBeCloseTo((2 * P("tomato").yield_lb_per_10ft! * P("tomato").spacing_ft) / 10, 6);
    expect(f.compost_lb_yr).toBeCloseTo(3 * 2.5 * 52 * 0.3, 6);
    expect(f.compost_share_pct).toBeGreaterThan(0);
  });
});
