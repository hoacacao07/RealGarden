import type { Metadata } from "next";

import { Suspense } from "react";

import { groupOf, isNative } from "@/lib/catalog";
import { getPlants } from "@/lib/data";
import { THEMES } from "@/lib/engine/suggest";

import { PlantCatalog } from "./plant-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plants" };

export default async function PlantsPage() {
  const plants = await getPlants();
  const n = (g: string) => plants.filter((p) => groupOf(p) === g).length;
  const themes = THEMES.map((t) => ({ id: t.id, name: t.name, emoji: t.emoji, ids: Object.values(t.pools).flat() }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Plant catalog</h1>
        <p className="text-muted-foreground">
          {n("vegetable") + n("herb")} vegetables and herbs, {n("fruit")} fruits, {n("flower")} flowers and {n("shrub_tree")} shrubs and trees.{" "}
          {plants.filter(isNative).length} are Florida natives. Invasive plants are never suggested.
        </p>
      </div>
      <Suspense><PlantCatalog plants={plants} themes={themes} /></Suspense>
      <p className="text-xs text-muted-foreground">Plant data partly from Permapeople.org (CC BY-SA 4.0). Florida details from UF/IFAS Extension publications, not yet verified.</p>
    </div>
  );
}
