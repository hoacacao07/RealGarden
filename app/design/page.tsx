import type { Metadata } from "next";

import { getGarden, getPlants } from "@/lib/data";

import { Studio } from "./studio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Design" };

export default async function DesignPage({ searchParams }: PageProps<"/design">) {
  const sp = await searchParams;
  const gardenId = typeof sp.garden === "string" ? sp.garden : null;
  const tab = typeof sp.tab === "string" && ["plan", "colors", "timeline"].includes(sp.tab) ? sp.tab : "plan";
  const [plants, garden] = await Promise.all([getPlants(), gardenId ? getGarden(gardenId) : Promise.resolve(null)]);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <Studio plants={plants} garden={garden} initialTab={tab} />
    </div>
  );
}
