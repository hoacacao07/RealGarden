/** Phase 10 soil tests: TAW from survey AWC, pH filter, survey parsing. Expected values hand-computed. */
import { describe, expect, it } from "vitest";

import plantsJson from "../data/plants.json";
import soilFixture from "../data/fixtures/soil_sda.json";
import { scorePlant } from "../lib/engine/recommend";
import { drainageFrom, factsFromSurvey, phDistance, sdaRows, soilTips, soilTypeFrom } from "../lib/engine/soil";
import { zoneParams } from "../lib/engine/water";
import type { Plant, SiteInput } from "../lib/types";

const PLANTS = plantsJson as unknown as Plant[];
const plant = (id: string) => PLANTS.find((p) => p.id === id)!;

describe("TAW from survey AWC", () => {
  // TAW = 1000 · AWC · Zr. Zr = 18 in = 0.4572 m, AWC 0.08 → 36.576 mm (the sand table would give 27.432).
  it("uses AWC when given", () => {
    const p = zoneParams([{ kc: 0.5, root_depth_in: 18, canopy_sqft: 10, establishing: false }], "sand", 0.08);
    expect(p.taw_mm).toBeCloseTo(36.576, 3);
    expect(p.raw_mm).toBeCloseTo(18.288, 3);
  });
  it("falls back to the soil table without AWC", () => {
    const p = zoneParams([{ kc: 0.5, root_depth_in: 18, canopy_sqft: 10, establishing: false }], "sand", null);
    expect(p.taw_mm).toBeCloseTo(27.432, 3);
  });
});

describe("pH filter", () => {
  const base: SiteInput = { lat: 28, lon: -82.4, region: "central", sun: "full_sun", soil: "sand", drainage: "fast", coastal_distance_mi: 9, area_sqft: 640, soil_source: "survey" };
  const sage = plant("salvia_coccinea"); // ph_range [5.5, 8]
  it("distance outside the range", () => {
    expect(phDistance(6, [5.5, 8])).toBe(0);
    expect(phDistance(5.2, [5.5, 8])).toBeCloseTo(0.3, 6);
    expect(phDistance(8.7, [5.5, 8])).toBeCloseTo(0.7, 6);
  });
  it("more than 0.5 outside → excluded", () => {
    expect(scorePlant({ ...base, ph: 4.9 }, sage).score).toBe(0);
    expect(scorePlant({ ...base, ph: 4.9 }, sage).excluded).toMatch(/outside its range/);
  });
  it("within 0.5 of the edge → −0.1 and a reason", () => {
    const inside = scorePlant({ ...base, ph: 6 }, sage);
    const edge = scorePlant({ ...base, ph: 5.2 }, sage);
    expect(inside.score - edge.score).toBeCloseTo(0.1, 6);
    expect(edge.reasons[0]).toMatch(/edge of its range/);
  });
  it("ignores pH from an untrusted (unknown) source", () => {
    expect(scorePlant({ ...base, ph: 4.0, soil_source: "unknown" }, sage).score).toBeGreaterThan(0);
  });
});

describe("survey parsing", () => {
  const fx = soilFixture as unknown as Record<string, { Table: (string | null)[][] }>;
  it("Urban land complex → unknown source, values kept as hints", () => {
    const f = factsFromSurvey(sdaRows(fx["27.93,-82.50"])[0]);
    expect(f.soil_source).toBe("unknown");
    expect(f.urban).toBe(true);
    expect(f.ph).toBe(5);
  });
  it("Candler fine sand → survey, sand, fast drainage", () => {
    const f = factsFromSurvey(sdaRows(fx["28.06,-82.41"])[0]);
    expect(f.soil_source).toBe("survey");
    expect(soilTypeFrom(f)).toBe("sand");
    expect(drainageFrom(f.drainage_class)).toBe("fast");
  });
  it("low organic matter → mulch tip", () => {
    expect(soilTips({ region: "central", om_pct: 1.2, soil_source: "survey" }).map((t) => t.key)).toContain("mulch");
  });
});
