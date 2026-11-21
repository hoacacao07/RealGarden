"use client";

import dynamic from "next/dynamic";

import { CATEGORY_COLOR } from "@/components/garden-canvas";
import { litDepth, sunAtLocalHour } from "@/lib/engine/balconySun";
import { potDiameterIn } from "@/lib/engine/containerWater";
import type { PlacedPlant, PotOut } from "@/lib/predict";
import { useUI } from "@/lib/store";
import type { SiteInput } from "@/lib/types";

const BalconyCanvas = dynamic(() => import("@/components/balcony/balcony-canvas"), { ssr: false, loading: () => <div className="aspect-[2/1] rounded-2xl bg-muted/50" /> });

/** Read-only balcony as it is today, with this month's 3 PM sun. Click a pot to open the plant in the inspector. */
export function MiniBalcony({ site, pots, placed, today }: { site: SiteInput; pots: PotOut[]; placed: PlacedPlant[]; today: string }) {
  const open = useUI((s) => s.openInspector);
  const month = Number(today.slice(5, 7));
  const sun = sunAtLocalHour(site.lat, site.lon, month, 15);
  const lit = litDepth(site, sun.azimuth_deg, sun.altitude_deg);
  const items = pots.map((p) => {
    const pp = placed.find((x) => x.id === p.id)!;
    return { key: p.id, name: p.name, x_ft: pp.x_ft, y_ft: pp.y_ft, diameter_ft: potDiameterIn(p.gal) / 12, mount: p.mount, color: CATEGORY_COLOR[pp.plant.category] ?? "#4f9a6a" };
  });
  const openKey = (key: string | null) => {
    const pp = placed.find((p) => p.id === key);
    if (pp) open({ plant: pp.plant, plantedOn: pp.planted_on, today });
  };
  return (
    <div className="rounded-2xl border bg-card p-3">
      <BalconyCanvas lengthFt={site.balcony_l_ft ?? 10} depthFt={site.balcony_w_ft ?? 5} facingDeg={site.facing_deg ?? 180}
        overhangDepthFt={site.overhang_depth_ft ?? 0} litDepthFt={lit} litLabel={lit > 0 ? `${lit.toFixed(1)} ft deep` : "none on the floor"}
        pots={items} readOnly onSelect={openKey} onOpen={openKey} label="Balcony today, read only" />
    </div>
  );
}
