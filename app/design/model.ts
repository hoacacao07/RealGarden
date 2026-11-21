"use client";

import { useMemo } from "react";

import { useDesign, type Draft } from "@/lib/design-store";
import { gardenGrowth } from "@/lib/engine/growth";
import { nativePct } from "@/lib/engine/impact";
import { recommend } from "@/lib/engine/recommend";
import { overcrowded } from "@/lib/engine/spacing";
import type { Plant } from "@/lib/types";

export interface Grown { d: Draft; plant: Plant; radius_ft: number; height_ft: number; warn: boolean }

/** Everything the tabs derive from the editing session: sizes at the chosen year, warnings, ranking, native %. */
export function useModel(plants: Plant[], yearOverride?: number, placementsOverride?: Draft[]) {
  const site = useDesign((s) => s.site);
  const theme = useDesign((s) => s.theme);
  const storePlacements = useDesign((s) => s.placements);
  const storeYear = useDesign((s) => s.year);
  const placements = placementsOverride ?? storePlacements;
  const year = yearOverride ?? storeYear;
  const byId = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);

  const recs = useMemo(() => (site ? recommend(site, plants, theme) : { natives: [], nonNatives: [], edibles: [] }), [site, plants, theme]);

  return useMemo(() => {
    const valid = placements.filter((d) => byId.has(d.plant_id));
    const { grown, warnings } = gardenGrowth(valid.map((d) => ({ id: d.key, plant: byId.get(d.plant_id)!, x_ft: d.x_ft, y_ft: d.y_ft })), year);
    const crowd = overcrowded(valid.map((d) => ({ id: d.key, x_ft: d.x_ft, y_ft: d.y_ft, spacing_ft: byId.get(d.plant_id)!.spacing_ft, name: byId.get(d.plant_id)!.common_name })));
    const warnKeys = new Set([...warnings.map((w) => w.placement_id), ...crowd.flatMap((c) => [c.a, c.b])]);
    const items: Grown[] = grown.map((g, i) => ({ d: valid[i], plant: g.plant, radius_ft: g.radius_ft, height_ft: g.height_ft, warn: warnKeys.has(g.id) }));
    const placedPlants = valid.map((d) => byId.get(d.plant_id)!);
    // Group crowding messages by plant pair so a dense bed shows one line, not twenty.
    const crowdMsgs = new Map<string, number>();
    for (const c of crowd) {
      const a = byId.get(valid.find((v) => v.key === c.a)!.plant_id)!.common_name;
      const b = byId.get(valid.find((v) => v.key === c.b)!.plant_id)!.common_name;
      const k = [a, b].sort().join(" and ");
      crowdMsgs.set(k, (crowdMsgs.get(k) ?? 0) + 1);
    }
    return {
      byId, recs, items, placedPlants,
      shade: warnings,
      crowding: [...crowdMsgs.entries()].map(([pair, n]) => `${pair}: ${n} pair${n > 1 ? "s" : ""} closer than 0.8 × spacing`),
      // Edibles never count toward native %: the meter covers the landscape only.
      native: nativePct(placedPlants.filter((p) => p.origin !== "edible")),
    };
  }, [placements, byId, year, recs]);
}
