import type { Metadata } from "next";

import { getPlants } from "@/lib/data";

import { StarterFlow } from "./starter-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start my garden" };

/** Garden Starter (Phase 11): goals → time, budget, space → location, sun and soil → generated plan → Design studio. */
export default async function StartPage() {
  const plants = await getPlants();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <StarterFlow plants={plants} />
    </div>
  );
}
