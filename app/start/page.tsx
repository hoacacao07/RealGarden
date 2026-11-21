import type { Metadata } from "next";

import { getPlants } from "@/lib/data";
import { THEMES } from "@/lib/engine/suggest";

import { StarterFlow } from "./starter-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start my garden" };

/** Garden Starter, style first (spec 2B): style → place → suggested plants (by ZIP zone, sun, soil) → Design studio. */
export default async function StartPage() {
  const plants = await getPlants();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <StarterFlow themes={THEMES} plants={plants} />
    </div>
  );
}
