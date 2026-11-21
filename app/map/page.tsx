import type { Metadata } from "next";

import { getGarden, getPlants, getReports } from "@/lib/data";

import { DiseaseMap } from "./disease-map";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Disease map" };

export default async function MapPage() {
  const [reports, maria, plants] = await Promise.all([getReports(), getGarden("maria"), getPlants()]);
  const names = Object.fromEntries(plants.map((p) => [p.id, p.common_name]));
  const home = maria ? { lat: maria.site.lat, lon: maria.site.lon, name: maria.name } : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Neighborhood plant health</h1>
        <p className="text-muted-foreground max-w-3xl">
          Problems that gardeners shared from their photo check-ins. Locations are rounded to about 1 km, and nothing identifies a person.
          Three or more reports of the same issue within 10 km of a garden trigger an alert on its dashboard.
        </p>
      </header>
      <DiseaseMap initial={reports} home={home} names={names} />
    </div>
  );
}
