"use client";

import dynamic from "next/dynamic";

import { CATEGORY_COLOR } from "@/components/garden-canvas";
import { colorInMonth } from "@/lib/engine/color";
import type { PlacedPlant } from "@/lib/predict";
import { useUI } from "@/lib/store";
import type { ZoneInput } from "@/lib/types";

const GardenCanvas = dynamic(() => import("@/components/garden-canvas"), { ssr: false, loading: () => <div className="aspect-[16/10] rounded-2xl bg-muted/50" /> });

/** Read-only canvas of the garden as it is today, colored by what each plant shows this month. */
export function MiniCanvas({ width, height, zones, placed, today }: { width: number; height: number; zones: ZoneInput[]; placed: PlacedPlant[]; today: string }) {
  const open = useUI((s) => s.openInspector);
  const month = Number(today.slice(5, 7));
  const items = placed.map((pp) => {
    const c = colorInMonth(pp.plant, month, pp.age_years >= pp.plant.years_to_first_bloom);
    return {
      key: pp.id, name: pp.plant.common_name, x_ft: pp.x_ft, y_ft: pp.y_ft, radius_ft: Math.max(0.6, pp.radius_ft),
      color: c.kind === "foliage" ? pp.plant.foliage_color : c.hex, ring: CATEGORY_COLOR[pp.plant.category],
    };
  });
  const openKey = (key: string | null) => {
    const pp = placed.find((p) => p.id === key);
    if (pp) open({ plant: pp.plant, plantedOn: pp.planted_on, today });
  };
  return (
    <div className="rounded-2xl border bg-card p-3">
      <GardenCanvas widthFt={width} heightFt={height} items={items} zones={zones} readOnly label="Garden layout today, read only"
        onSelect={openKey} onOpen={openKey} />
    </div>
  );
}
