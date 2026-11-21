/** Engine math tests. Expected values are hand-computed (see comments). */
import { describe, expect, it } from "vitest";

import plantsJson from "../data/plants.json";
import { beautyMonth } from "../lib/engine/beauty";
import { bloomOverlap, colorMatch, deltaE, hexToLab, isHarmony } from "../lib/engine/color";
import { clusterReports, gardenDiseaseHits } from "../lib/engine/disease";
import { frostNights, frostRisk } from "../lib/engine/frost";
import { regionForLat } from "../lib/engine/geo";
import { heightAt, spreadAt } from "../lib/engine/growth";
import { formatRange, gddDates, gddDay, lastBloomEnd, predictBloom, type Normals } from "../lib/engine/phenology";
import { nativeSwap, recommend } from "../lib/engine/recommend";
import { fillBed, offsetCount, overcrowded, squareCount } from "../lib/engine/spacing";
import { rankStormPlants } from "../lib/engine/storm";
import { effectiveRain, forecastPlan, mmToGal, step, zoneParams } from "../lib/engine/water";
import type { Plant, SiteInput } from "../lib/types";

const PLANTS = plantsJson as unknown as Plant[];
const plant = (id: string) => PLANTS.find((p) => p.id === id)!;
const firebush = plant("hamelia_patens");

describe("growth (logistic)", () => {
  // Firebush: H = (6+12)/2 = 9 ft, h0 = 1.5 ft, r = 0.9 (fast).
  it("starts at planting height", () => expect(heightAt(firebush, 0)).toBeCloseTo(1.5, 6));
  // h(1) = 9 / (1 + 5·e^-0.9) = 9 / 3.03285 = 2.9675
  it("year 1", () => expect(heightAt(firebush, 1)).toBeCloseTo(2.9675, 3));
  // h(3) = 9 / (1 + 5·e^-2.7) = 9 / 1.33603 = 6.7364
  it("year 3", () => expect(heightAt(firebush, 3)).toBeCloseTo(6.7364, 3));
  // spread(3) = 6.5 · 6.7364 / 9 = 4.8652
  it("spread scales with height", () => expect(spreadAt(firebush, 3)).toBeCloseTo(4.8652, 3));
  it("approaches mature height", () => expect(heightAt(firebush, 30)).toBeCloseTo(9, 2));
});

describe("water balance (FAO-56)", () => {
  // Sand θfc−θwp = 0.06, Zr = 18 in = 0.4572 m → TAW = 27.432 mm, RAW = 13.716 mm. Kc 0.5 × 1.3 = 0.65.
  const p = zoneParams([{ kc: 0.5, root_depth_in: 18, canopy_sqft: 10, establishing: true }], "sand");
  it("TAW, RAW and establishing Kc", () => {
    expect(p.taw_mm).toBeCloseTo(27.432, 3);
    expect(p.raw_mm).toBeCloseTo(13.716, 3);
    expect(p.kc).toBeCloseTo(0.65, 6);
  });
  it("effective rain", () => {
    expect(effectiveRain(1.9)).toBe(0);
    expect(effectiveRain(5)).toBe(4);
  });
  // 10 − 0.8·5 − 0 + 0.65·4 = 8.6 ; light rain (1.5 mm) is ignored → 12.6 ; clamps at 0 and TAW.
  it("daily depletion step", () => {
    expect(step(10, 5, 0, 2.6, p.taw_mm)).toBeCloseTo(8.6, 6);
    expect(step(10, 1.5, 0, 2.6, p.taw_mm)).toBeCloseTo(12.6, 6);
    expect(step(1, 50, 0, 2.6, p.taw_mm)).toBe(0);
    expect(step(26, 0, 0, 5, p.taw_mm)).toBeCloseTo(27.432, 3);
  });
  const days = (rain: number[]) => rain.map((r, i) => ({ date: `2025-03-${String(2 + i).padStart(2, "0")}`, rain_mm: r, et0_mm: 5 }));
  // ETc = 3.25/day. Dr0 = 13.25 (< RAW), Dr1 = 16.5 (> RAW) → water on day 0, refill 13.25 → 13.3 mm.
  // Then Dr climbs 3.25/day from 0 and passes RAW on day 5 (16.25) → water again on day 4.
  it("waters the day before crossing RAW", () => {
    const plan = forecastPlan(10, days([0, 0, 0, 0, 0, 0, 0]), p, 15);
    expect(plan[0].recommendation).toBe("water");
    expect(plan[0].irrigation_mm).toBeCloseTo(13.3, 6);
    expect(plan[4].recommendation).toBe("water");
    expect(plan.filter((d) => d.recommendation === "water")).toHaveLength(2);
  });
  // Dr0 = 12 + 3.25 = 15.25 > RAW on day 0, 8 mm rain on day 1 → skip day 0.
  it("skips when ≥ 6 mm rain is coming", () => {
    const plan = forecastPlan(12, days([0, 8, 0, 0, 0, 0, 0]), p, 15);
    expect(plan[0].recommendation).toBe("skip");
    expect(plan[1].recommendation).toBe("water");
  });
  it("storm pause waters nothing", () => {
    const plan = forecastPlan(12, days([0, 0, 0, 0, 0, 0, 0]), p, 15, true);
    expect(plan.every((d) => d.irrigation_mm === 0)).toBe(true);
  });
  // 1 inch over 100 sq ft = 62.3 gal.
  it("gallons", () => expect(mmToGal(25.4, 100)).toBeCloseTo(62.3, 6));
});

describe("frost", () => {
  it("thresholds", () => {
    expect(frostRisk(32, 32, false)).toBe("high");
    expect(frostRisk(35, 32, false)).toBe("medium");
    expect(frostRisk(35.5, 32, false)).toBe("low");
    expect(frostRisk(38, 32, true)).toBe("medium");
    expect(frostRisk(38.5, 32, true)).toBe("low");
  });
  it("groups nights", () => {
    const n = frostNights([{ date: "2025-01-22", tmin_f: 37 }, { date: "2025-01-23", tmin_f: 50 }], [
      { id: "a", name: "Firebush", cold_hardy_f: 32, young: true },
      { id: "b", name: "Muhly", cold_hardy_f: 0, young: false },
    ]);
    expect(n).toHaveLength(1);
    expect(n[0].severity).toBe("medium");
    expect(n[0].affected.map((a) => a.name)).toEqual(["Firebush"]);
  });
});

describe("storm", () => {
  // risk = height × (1 low, 0.5 medium, 0.2 high): 6×0.5 = 3 > 10×0.2 = 2 > 1×1 = 1
  it("ranks by height × wind factor", () => {
    const r = rankStormPlants([
      { id: "a", name: "Palm", height_ft: 10, wind_tolerance: "high" },
      { id: "b", name: "Firebush", height_ft: 6, wind_tolerance: "medium" },
      { id: "c", name: "Sage", height_ft: 1, wind_tolerance: "low" },
    ]);
    expect(r.map((x) => x.risk)).toEqual([3, 2, 1]);
  });
});

describe("phenology GDD", () => {
  // GDD = max(0, (Tmax + Tmin)/2 − base): (80+60)/2 − 50 = 20 ; (55+40)/2 = 47.5 < 50 → 0
  it("daily GDD", () => {
    expect(gddDay(80, 60, 50)).toBe(20);
    expect(gddDay(55, 40, 50)).toBe(0);
  });
  const flat: Normals = { tmean_f: {}, tmean_std_f: {} };
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) {
    const k = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    flat.tmean_f[k] = 60;
    flat.tmean_std_f[k] = 5;
  }
  // Normals 60 ± 5 °F, base 50 → +1 std: 15/day, −1 std: 5/day. Target 30 → earliest day 2, latest day 6.
  it("earliest/latest from normals ± 1 std", () => {
    const r = gddDates("2025-01-01", "2025-01-01", 30, 50, [], flat);
    expect(r.earliest).toBe("2025-01-02");
    expect(r.latest).toBe("2025-01-06");
  });
  // Observed day (90+70)/2 − 50 = 30 reaches the target on day 1 for both bounds.
  it("observed days override normals", () => {
    const r = gddDates("2025-01-01", "2025-01-01", 30, 50, [{ date: "2025-01-01", tmin_f: 70, tmax_f: 90 }], flat);
    expect(r.earliest).toBe("2025-01-01");
    expect(r.latest).toBe("2025-01-01");
  });
  it("last bloom end is the day after the bloom run", () => {
    expect(lastBloomEnd("2026-03-10", [8, 9, 10])).toBe("2025-11-01");
  });
  it("buds in a photo override", () => {
    const b = predictBloom({ plant: firebush, today: "2026-03-01", plantedOn: "2024-01-01", photo: { stage: "budding", date: "2026-03-01" } });
    expect([b?.earliest, b?.latest]).toEqual(["2026-03-08", "2026-03-15"]);
  });
  it("too young gives a first-bloom month", () => {
    const b = predictBloom({ plant: plant("myrcianthes_fragrans"), today: "2026-11-20", plantedOn: "2026-06-01" });
    expect(b?.confidence).toBe("low");
    expect(b?.earliest).toBe("2030-06-01");
  });
});

describe("color", () => {
  it("Lab of white and pure red", () => {
    const w = hexToLab("#FFFFFF");
    expect(w[0]).toBeCloseTo(100, 1);
    expect(Math.abs(w[1]) + Math.abs(w[2])).toBeLessThan(0.1);
    const r = hexToLab("#FF0000");
    expect(r[0]).toBeCloseTo(53.24, 1);
    expect(r[1]).toBeCloseTo(80.09, 1);
    expect(r[2]).toBeCloseTo(67.2, 1);
  });
  // ΔE(white, black) = 100 ; ΔE(red, white) = √(46.76² + 80.09² + 67.20²) = 114.55
  it("ΔE", () => {
    expect(deltaE(hexToLab("#FFFFFF"), hexToLab("#000000"))).toBeCloseTo(100, 1);
    expect(deltaE(hexToLab("#FF0000"), hexToLab("#FFFFFF"))).toBeCloseTo(114.55, 0);
  });
  it("match c = max(0, 1 − ΔE/50)", () => {
    expect(colorMatch("#8E4FB0", "#8E4FB0")).toBe(1);
    expect(colorMatch("#FFFFFF", "#000000")).toBe(0);
  });
  it("yellow tickseed pairs with purple blazing star, overlapping Aug–Oct", () => {
    const t = plant("coreopsis_leavenworthii");
    const b = plant("liatris_spicata");
    expect(isHarmony(t.flower_colors[0].hex, b.flower_colors[0].hex, "complementary")).toBe(true);
    expect(bloomOverlap(t, b)).toEqual([8, 9, 10]);
  });
});

describe("spacing", () => {
  // 100 / 2² = 25 ; 100 / (4·0.8660) = 28.87 → 28
  it("grid counts", () => {
    expect(squareCount(100, 2)).toBe(25);
    expect(offsetCount(100, 2)).toBe(28);
  });
  // spacing 4 → minimum 3.2 ft
  it("overcrowding below 0.8 × spacing", () => {
    const s = (id: string, x: number) => ({ id, x_ft: x, y_ft: 0, spacing_ft: 4, name: id });
    expect(overcrowded([s("a", 0), s("b", 3)])).toHaveLength(1);
    expect(overcrowded([s("a", 0), s("b", 3.3)])).toHaveLength(0);
  });
  it("bed fill keeps spacing", () => {
    const pts = fillBed({ x: 0, y: 0, w: 10, h: 10 }, 2);
    expect(pts.length).toBeGreaterThan(20);
    const sp = pts.map((p, i) => ({ id: String(i), ...p, spacing_ft: 2, name: "x" }));
    expect(overcrowded(sp.map((x) => ({ ...x, spacing_ft: 2 / 0.8 * 0.79 })))).toHaveLength(0);
  });
});

describe("recommender", () => {
  const site: SiteInput = { lat: 27.93, lon: -82.5, region: "central", sun: "full_sun", soil: "sand", drainage: "fast", coastal_distance_mi: 2, area_sqft: 640 };
  const r = recommend(site, PLANTS, "wildlife");
  it("never shows invasives, natives first", () => {
    const all = [...r.natives, ...r.nonNatives];
    expect(all.some((s) => s.plant.invasive_status === "invasive")).toBe(false);
    expect(r.natives.every((s) => s.plant.origin === "native")).toBe(true);
    expect(r.natives.length).toBeGreaterThan(15);
  });
  it("filters plants not native to the region", () => {
    expect(r.natives.some((s) => s.plant.id === "stokesia_laevis")).toBe(false);
  });
  it("Mexican petunia swap", () => {
    expect(nativeSwap(plant("ruellia_simplex"), PLANTS)?.message).toBe("Mexican petunia is invasive in Florida. Try wild petunia for the same purple.");
  });
  it("regions by latitude", () => {
    expect(regionForLat(29.65)).toBe("north");
    expect(regionForLat(27.95)).toBe("central");
    expect(regionForLat(26.1)).toBe("south");
  });
});

describe("beauty and disease", () => {
  // fill = 50/100 = 0.5 ; bloom = 50/50 = 1 ; 1 family (red-orange → red) / 4 = 0.25 → 100·(0.2 + 0.4 + 0.05) = 65
  it("beauty score", () => {
    const m = beautyMonth([{ plant: firebush, canopy_sqft: 50, can_bloom: true }], 100, 6);
    expect(m.score).toBe(65);
  });
  it("cluster of 3 within 10 km warns", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const pts = [[27.94, -82.49], [27.92, -82.48], [27.95, -82.51]].map(([lat, lon], i) => ({
      id: String(i), issue_key: "leaf_spot", label: "Leaf spot", host_plant_id: null, lat, lon, is_sample: true, created_at: "2026-11-15T00:00:00Z",
    }));
    const c = clusterReports(pts, now);
    expect(c).toHaveLength(1);
    expect(gardenDiseaseHits(c, 27.928, -82.497, [firebush])[0].susceptible).toEqual(["Firebush"]);
    expect(clusterReports(pts, new Date("2026-12-30T00:00:00Z"))).toHaveLength(0);
  });
});

describe("formatRange", () => {
  it("omits the year inside the current year and adds it otherwise", () => {
    expect(formatRange("2026-08-13", "2026-08-31", "2026-11-21")).toBe("Aug 13 – Aug 31");
    expect(formatRange("2027-08-13", "2027-08-31", "2026-11-21")).toBe("Aug 13 – Aug 31, 2027");
    expect(formatRange("2026-12-20", "2027-01-05", "2026-11-21")).toBe("Dec 20, 2026 – Jan 5, 2027");
    expect(formatRange("2027-03-01", "2027-03-01", "2026-11-21")).toBe("Mar 1, 2027");
  });
});
