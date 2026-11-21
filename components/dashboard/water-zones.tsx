"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Info } from "lucide-react";

import { gallons } from "@/lib/format";
import type { ZoneOut } from "@/lib/predict";

import { WaterCalendar } from "./water-calendar";

const DepletionChart = dynamic(() => import("./depletion-chart"), { ssr: false, loading: () => <div className="h-48 rounded-xl bg-muted/50" /> });

const IRR = { none: "No irrigation", drip: "Drip", spray: "Spray heads" } as Record<string, string>;

export function WaterZones({ zones }: { zones: ZoneOut[] }) {
  const [sel, setSel] = useState(zones[0]?.id);
  const z = zones.find((x) => x.id === sel) ?? zones[0];
  if (!z) return <p className="text-sm text-muted-foreground">No zones in this garden yet.</p>;
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4">
      {zones.length > 1 && (
        <div role="tablist" aria-label="Irrigation zones" className="flex flex-wrap gap-1.5">
          {zones.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === z.id} onClick={() => setSel(x.id)}
              className="rounded-full border px-3 py-1 text-sm aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary hover:bg-muted aria-selected:hover:bg-primary">
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <p><span className="text-muted-foreground">Zone:</span> <strong>{z.name}</strong></p>
        <p><span className="text-muted-foreground">Irrigation:</span> {IRR[z.irrigation] ?? z.irrigation}</p>
        <p><span className="text-muted-foreground">Plants:</span> {z.plants}</p>
        <p><span className="text-muted-foreground">Area:</span> {Math.round(z.area_sqft)} sq ft</p>
        <p><span className="text-muted-foreground">Saved this week:</span> <strong className="text-primary">{gallons(z.saved_gal_week)} gal</strong></p>
      </div>
      <WaterCalendar zone={z} />
      <DepletionChart zone={z} />
      <p className="text-xs text-muted-foreground flex gap-1.5 items-start"><Info className="size-3.5 mt-0.5 shrink-0" aria-hidden />{z.why}</p>
    </div>
  );
}
