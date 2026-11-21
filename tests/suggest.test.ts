import { describe, expect, it } from "vitest";

import { groupOf, isNative, normalizePlant, zonesOf } from "../lib/catalog";
import { PLANTS } from "../lib/catalog-data";
import { hardFilter, nativeWeight, plantWhen, rulePicks, suggest, themeTerm, THEMES, validatePicks, type SuggestCtx } from "../lib/engine/suggest";
import { zoneForLat, zoneMinF } from "../lib/engine/zone";
import type { SiteInput } from "../lib/types";

const byId = new Map(PLANTS.map((p) => [p.id, p]));
const P = (id: string) => {
  const p = byId.get(id);
  if (!p) throw new Error(`no plant ${id}`);
  return p;
};

const tampa: SiteInput = {
  lat: 27.889, lon: -82.505, zip: "33611", region: "central", sun: "full_sun", soil: "sand", drainage: "fast",
  coastal_distance_mi: 2, area_sqft: 600, soil_source: "unknown", kind: "yard",
};
const ctx = (o: Partial<SuggestCtx> = {}): SuggestCtx => ({ site: tampa, zone: "10a", themes: [], prefer_natives: "off", today: "2026-11-21", ...o });

describe("catalog", () => {
  it("has about 80+ plants across every group, with natives as a separate flag", () => {
    expect(PLANTS.length).toBeGreaterThanOrEqual(80);
    const groups = new Set(PLANTS.map(groupOf));
    for (const g of ["vegetable", "herb", "fruit", "flower", "shrub_tree"]) expect(groups.has(g as never)).toBe(true);
    expect(groupOf(P("muscadine_grape"))).toBe("fruit");
    expect(isNative(P("muscadine_grape"))).toBe(true);
    expect(groupOf(P("strawberry"))).toBe("fruit");
  });
  it("theme pools only name real plants", () => {
    for (const t of THEMES) for (const ids of Object.values(t.pools)) for (const id of ids) expect(byId.has(id), `${t.id}: ${id}`).toBe(true);
  });
  it("derives zones from cold hardiness for perennials; annuals grow in every zone", () => {
    expect(zonesOf(P("mango"))).toEqual(["10a", "10b", "11a"]);
    expect(zonesOf(P("papaya"))).not.toContain("9b");
    expect(zonesOf(P("lettuce"))).toContain("8a");
    expect(normalizePlant(P("fig")).zones).toContain("8b");
  });
});

describe("zone", () => {
  it("zone minimum temperatures", () => {
    expect(zoneMinF("8a")).toBe(10);
    expect(zoneMinF("9b")).toBe(25);
    expect(zoneMinF("10a")).toBe(30);
    expect(zoneMinF("11a")).toBe(40);
  });
  it("latitude fallback", () => {
    expect(zoneForLat(30.44)).toBe("8b");
    expect(zoneForLat(27.9)).toBe("10a");
    expect(zoneForLat(25.77)).toBe("10b");
  });
});

describe("hard filters", () => {
  it("zone: tender perennials are out where winters are too cold", () => {
    const north: SiteInput = { ...tampa, region: "central" };
    expect(hardFilter(P("papaya"), ctx({ site: north, zone: "9a" }))).toMatch(/Too cold/);
    expect(hardFilter(P("papaya"), ctx({ zone: "10a" }))).toBeNull();
    expect(hardFilter(P("mango"), ctx())).toMatch(/central Florida|Too cold/);
  });
  it("season: vegetables only if their window opens within 8 weeks", () => {
    // Lettuce (central: Sep to Mar) is in season in November; cucumber (Feb to Mar, Sep) opens in Feb (> 8 weeks).
    expect(hardFilter(P("lettuce"), ctx())).toBeNull();
    expect(hardFilter(P("cucumber"), ctx())).toMatch(/Out of season/);
    expect(hardFilter(P("cucumber"), ctx({ today: "2026-01-10" }))).toBeNull();
    // Perennials have no window.
    expect(hardFilter(P("hamelia_patens"), ctx())).toBeNull();
  });
  it("invasive plants are always blocked", () => {
    expect(hardFilter(P("surinam_cherry"), ctx({ themes: ["fruit"] }))).toMatch(/Invasive/);
    const all = suggest(PLANTS, ctx({ themes: ["fruit", "butterfly", "tropical"] }));
    expect(all.ranked.some((s) => s.plant.invasive_status === "invasive" || s.plant.invasive_category)).toBe(false);
  });
  it("low-chill: fruit needing more chill than the zone gets is out", () => {
    const north: SiteInput = { ...tampa, lat: 30.4, region: "north" };
    expect(hardFilter(P("blueberry_southern_highbush"), ctx({ site: north, zone: "8b" }))).toBeNull();
    expect(hardFilter(P("peach_low_chill"), ctx())).toBeNull();
    expect(hardFilter(P("blackberry_thornless"), ctx({ zone: "10b" }))).toMatch(/chill/);
  });
  it("balcony: pots only", () => {
    const bal: SiteInput = { ...tampa, kind: "balcony", sun: "partial_shade" };
    expect(hardFilter(P("quercus_virginiana"), ctx({ site: bal }))).toMatch(/pot/);
  });
});

describe("score", () => {
  it("N weights: 1 when off; natives 1, non-natives 0.8 (some) and 0.6 (mostly)", () => {
    expect(nativeWeight(P("rose_knock_out"), "off")).toBe(1);
    expect(nativeWeight(P("rose_knock_out"), "some")).toBe(0.8);
    expect(nativeWeight(P("rose_knock_out"), "mostly")).toBe(0.6);
    expect(nativeWeight(P("hamelia_patens"), "mostly")).toBe(1);
  });
  it("turning on prefer natives re-ranks natives up", () => {
    const off = suggest(PLANTS, ctx({ themes: ["butterfly", "rose_flower"] })).ranked;
    const on = suggest(PLANTS, ctx({ themes: ["butterfly", "rose_flower"], prefer_natives: "mostly" })).ranked;
    const share = (r: typeof off) => r.slice(0, 10).filter((s) => isNative(s.plant)).length;
    expect(share(on)).toBeGreaterThan(share(off));
    const rose = (r: typeof off) => r.find((s) => s.plant.id === "rose_knock_out")!.score;
    expect(rose(on)).toBeCloseTo(rose(off) * 0.6, 2);
  });
  it("theme pools score 1, others lower", () => {
    expect(themeTerm(P("asclepias_tuberosa"), ["butterfly"])).toMatchObject({ value: 1, theme: "butterfly", role: "host" });
    expect(themeTerm(P("lettuce"), ["butterfly"]).value).toBeLessThan(1);
    expect(themeTerm(P("lettuce"), []).value).toBe(1);
  });
  it("Plant now / Plant in <month> badges", () => {
    expect(plantWhen(P("lettuce"), tampa, "2026-11-21").label).toBe("Plant now");
    expect(plantWhen(P("cucumber"), tampa, "2026-11-21").label).toBe("Plant in February");
  });
});

describe("picks", () => {
  it("AI output validator rejects unknown plant ids, duplicates and bad quantities", () => {
    const ids = new Set(["lettuce", "kale"]);
    expect(validatePicks([{ plant_id: "lettuce", qty: 4, reason: "ok" }], ids)).toHaveLength(1);
    expect(() => validatePicks([{ plant_id: "unicorn_tree", qty: 1, reason: "x" }], ids)).toThrow(/unknown plant id/);
    expect(() => validatePicks([{ plant_id: "kale", qty: 1, reason: "x" }, { plant_id: "kale", qty: 2, reason: "y" }], ids)).toThrow(/duplicate/);
    expect(() => validatePicks([{ plant_id: "kale", qty: 0, reason: "x" }], ids)).toThrow(/qty/);
    expect(() => validatePicks([], ids)).toThrow();
  });
  it("rule picks cover every chosen theme and only use ranked plants", () => {
    const c = ctx({ themes: ["butterfly", "salad"], goals: ["butterflies", "food"] });
    const { ranked } = suggest(PLANTS, c);
    const picks = rulePicks(ranked, c);
    const ids = new Set(ranked.map((s) => s.plant.id));
    expect(picks.every((p) => ids.has(p.plant_id))).toBe(true);
    const themes = new Set(picks.map((p) => ranked.find((s) => s.plant.id === p.plant_id)!.theme));
    expect(themes.has("butterfly") && themes.has("salad")).toBe(true);
  });
});
