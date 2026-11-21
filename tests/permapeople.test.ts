import { describe, expect, it } from "vitest";

import { PLANTS, PLANTS_RAW } from "@/lib/catalog-data";
import {
  applyOverlay, buildOverlay, mapGrowth, mapLifeCycle, mapLight, mapPh, mapWater, OVERLAY_FIELDS, parseReview, patchFor, sameSpecies, type Overlay,
} from "@/lib/engine/permapeople";

describe("Permapeople value mapping", () => {
  it("light", () => {
    expect(mapLight("Full sun, partial sun/shade")).toEqual(["full_sun", "partial_shade"]);
    expect(mapLight("Full shade")).toEqual(["full_shade"]);
    expect(mapLight("lots")).toBeNull();
    expect(mapLight(null)).toBeNull();
  });

  it("water, pH, life cycle, growth", () => {
    expect(mapWater("Dry, moist")).toBe("low");
    expect(mapWater("Moist")).toBe("medium");
    expect(mapWater("Wet")).toBe("high");
    expect(mapWater("Moist, Wet")).toBe("high");
    expect(mapWater("Dry, Moist, Wet")).toBe("medium");
    expect(mapWater("Wet, Dry")).toBe("medium");
    expect(mapPh("5.5-7.0")).toEqual([5.5, 7]);
    expect(mapPh("14")).toBeNull();
    expect(mapLifeCycle("Perennial grown as annual")).toBe("annual");
    expect(mapLifeCycle("Biennial")).toBe("biennial");
    expect(mapGrowth("Moderate")).toBe("medium");
  });

  it("species check catches wrong search hits", () => {
    expect(sameSpecies("Solanum lycopersicum var. cerasiforme", "Solanum lycopersicum")).toBe(true);
    expect(sameSpecies("Ocimum basilicum", "Solanum lycopersicum")).toBe(false);
    expect(sameSpecies("Asclepias tuberosa", "Asclepias incarnata")).toBe(false); // same genus, other species
    expect(sameSpecies("Citrus meyeri", "Citrus × meyeri")).toBe(true);
    expect(sameSpecies("Rosa chinensis", "Rosa 'Knock Out'")).toBe(true); // cultivar name: genus is enough
    expect(sameSpecies(null, "Solanum lycopersicum")).toBe(false);
  });

  it("life cycle never comes from Permapeople", () => {
    expect(OVERLAY_FIELDS).not.toContain("life_cycle");
    expect(patchFor({ permapeople_id: 1, life_cycle: "Perennial" })).toEqual({});
  });
});

describe("overlay", () => {
  const imp = { permapeople_id: 7, matched: "Solanum lycopersicum", light: "Full sun", water: "Moist", height_ft: [6.6, 3.3] as [number, number], width_ft: [26, 26] as [number, number], life_cycle: "Annual" };

  it("patch sorts sizes and leaves out flagged fields", () => {
    const p = patchFor(imp, new Set(["mature_spread_ft"]));
    expect(p.mature_height_ft).toEqual([3.3, 6.6]);
    expect(p.mature_spread_ft).toBeUndefined();
    expect(p.light).toEqual(["full_sun"]);
    expect(p.water_need).toBe("medium");
  });

  it("review CSV blocks height and width", () => {
    const r = parseReview("plant_id,field,value,problem\ntomato,width_ft,26-26,outside 0.2-12 ft\ntomato,search,,no match\n");
    expect([...r.get("tomato")!]).toEqual(["mature_spread_ft"]);
  });

  it("buildOverlay skips wrong matches and unknown plants", () => {
    const catalog = [{ id: "tomato", scientific_name: "Solanum lycopersicum" }, { id: "basil", scientific_name: "Ocimum basilicum" }];
    const { overlay, skipped } = buildOverlay(
      { tomato: imp, basil: { permapeople_id: 9, matched: "Mentha spicata", light: "Full sun" }, gone: { permapeople_id: 1, matched: "X y" } },
      "plant_id,field,value,problem\ntomato,width_ft,26-26,outside\n", catalog, "2026-11-21T00:00:00Z",
    );
    expect(Object.keys(overlay.plants)).toEqual(["tomato"]);
    expect(overlay.plants.tomato.fields.mature_spread_ft).toBeUndefined();
    expect(skipped.map((s) => s.id).sort()).toEqual(["basil", "gone"]);
  });

  it("holds back sizes far from the team's value", () => {
    const catalog = [{ id: "grape", scientific_name: "Vitis rotundifolia", mature_height_ft: [6, 8] as [number, number] }];
    const { overlay, held } = buildOverlay(
      { grape: { permapeople_id: 3, matched: "Vitis rotundifolia", height_ft: [82, 82], light: "Full sun" } }, "plant_id,field,value,problem\n", catalog,
    );
    expect(overlay.plants.grape.fields.mature_height_ft).toBeUndefined();
    expect(overlay.plants.grape.fields.light).toEqual(["full_sun"]);
    expect(held[0].why).toContain("kept at 6-8 ft");
  });

  it("applyOverlay copies only generic fields", () => {
    const overlay = { plants: { tomato: { permapeople_id: 7, matched: "Solanum lycopersicum", fields: { light: ["partial_shade"], cold_hardy_f: -40 } } } } as unknown as Overlay;
    const out = applyOverlay({ id: "tomato", light: ["full_sun"], cold_hardy_f: 33 }, overlay);
    expect(out.light).toEqual(["partial_shade"]);
    expect(out.cold_hardy_f).toBe(33); // Florida field: never from Permapeople
    expect(out.permapeople_id).toBe(7);
    expect(applyOverlay({ id: "basil" }, overlay)).toEqual({ id: "basil" });
  });

  it("the catalog loads with the (empty) overlay", () => {
    expect(PLANTS).toHaveLength(PLANTS_RAW.length);
    expect(PLANTS.length).toBeGreaterThan(0);
  });
});
