import type { Metadata } from "next";

import { getPlants } from "@/lib/data";

import { PlantCatalog } from "./plant-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plants" };

export default async function PlantsPage() {
  const plants = await getPlants();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Plant catalog</h1>
        <p className="text-muted-foreground">
          {plants.filter((p) => p.origin === "native").length} Florida natives, {plants.filter((p) => p.origin === "edible").length} vegetables and herbs for the edible zone, plus a few popular non-natives so you can see what to swap them for.
        </p>
      </div>
      <PlantCatalog plants={plants} />
    </div>
  );
}
