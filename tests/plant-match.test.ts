import { describe, expect, it } from "vitest";

import { PLANTS } from "@/lib/catalog-data";
import { groupOf, isBlocked } from "@/lib/catalog";
import { matchPlants } from "@/lib/engine/plantMatch";

describe("plant match", () => {
  it("vegetable garden in full sun returns vegetables and herbs only", () => {
    const m = matchPlants(PLANTS, { types: ["vegetable"], sun: "full_sun" });
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => x.group === "vegetable" || x.group === "herb")).toBe(true);
  });

  it("fruit garden returns fruit only", () => {
    const m = matchPlants(PLANTS, { types: ["fruit"], sun: "full_sun" });
    expect(m.length).toBeGreaterThan(0);
    expect(m.every((x) => groupOf(x.plant) === "fruit")).toBe(true);
  });

  it("leaves out plants that can't take the sun", () => {
    const shade = matchPlants(PLANTS, { types: ["vegetable", "fruit"], sun: "full_shade" });
    // Full shade only keeps plants that list full or partial shade.
    expect(shade.every((x) => x.plant.light.some((l) => l !== "full_sun"))).toBe(true);
    expect(shade.length).toBeLessThan(matchPlants(PLANTS, { types: ["vegetable", "fruit"], sun: "full_sun" }).length);
  });

  it("thrives before tolerates, never invasive", () => {
    const m = matchPlants(PLANTS, { types: ["vegetable", "fruit", "herb", "flower"], sun: "partial_shade" });
    const firstTol = m.findIndex((x) => x.fit === "tolerates");
    if (firstTol >= 0) expect(m.slice(firstTol).every((x) => x.fit === "tolerates")).toBe(true);
    expect(m.some((x) => isBlocked(x.plant))).toBe(false);
  });

  it("zone filter drops plants that can't survive it", () => {
    const all = matchPlants(PLANTS, { types: ["fruit"], sun: "full_sun" });
    const north = matchPlants(PLANTS, { types: ["fruit"], sun: "full_sun", zone: "8a" });
    expect(north.length).toBeLessThanOrEqual(all.length);
    expect(north.every((x) => x.reason.includes("zone 8a"))).toBe(true);
  });
});
