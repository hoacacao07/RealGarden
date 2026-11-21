"use client";

import { CalendarClock, Camera } from "lucide-react";

import { Swatch } from "@/components/plant-bits";
import { formatRange } from "@/lib/engine/phenology";
import type { ComingUp, PlacedPlant } from "@/lib/predict";
import { useUI } from "@/lib/store";

const CONF = { high: "bg-primary", medium: "bg-[oklch(0.75_0.13_70)]", low: "bg-muted-foreground/40" };

/** Bloom and fruit predictions per species. Click a row to open the plant in the inspector. */
export function ComingUpCard({ items, today, placed }: { items: ComingUp[]; today: string; placed: PlacedPlant[] }) {
  const open = useUI((s) => s.openInspector);
  const now = items.filter((i) => i.now);
  const next = items.filter((i) => !i.now).slice(0, 7);
  const row = (i: ComingUp) => {
    const pp = placed.find((p) => p.plant.id === i.plant_id);
    return (
      <li key={i.plant_id + i.event}>
        <button className="w-full text-left flex gap-3 items-start rounded-xl p-2 hover:bg-muted"
          onClick={() => pp && open({ plant: pp.plant, plantedOn: pp.planted_on, today })}>
          <Swatch hex={i.color ?? "#4F7A3A"} className="size-4 mt-1 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm"><strong>{i.name}</strong>{i.count > 1 && <span className="text-muted-foreground"> ×{i.count}</span>}{" "}
              {i.event === "harvest"
                ? (i.now ? `ready to harvest, through ${formatRange(i.latest, i.latest, today)}` : `harvest ${formatRange(i.earliest, i.latest, today)}`)
                : `${i.event === "bloom" ? "blooms" : "fruits"} ${i.now ? "now" : formatRange(i.earliest, i.latest, today)}`}</span>
            <span className="block text-xs text-muted-foreground">
              {/photo/i.test(i.basis) && <Camera className="inline size-3 mr-1" aria-hidden />}{i.basis}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0" title={`${i.confidence} confidence`}>
            <span className={`size-2 rounded-full ${CONF[i.confidence]}`} aria-hidden />{i.confidence}
          </span>
        </button>
      </li>
    );
  };
  return (
    <section aria-labelledby="coming-h" className="rounded-2xl border bg-card p-4 space-y-3 self-start">
      <h2 id="coming-h" className="text-xl font-semibold flex items-center gap-2"><CalendarClock className="size-5 text-primary" aria-hidden /> Coming up</h2>
      {now.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground px-2">In season now</p>
          <ul>{now.slice(0, 5).map(row)}</ul>
        </div>
      )}
      {next.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground px-2">Next</p>
          <ul>{next.map(row)}</ul>
        </div>
      )}
      {!items.length && <p className="text-sm text-muted-foreground">No bloom or fruit predictions yet.</p>}
      <p className="text-xs text-muted-foreground px-2">Estimates from bloom calendars and growing-degree days (Tampa normals); harvests from days to harvest. A check-in photo showing buds sharpens the date.</p>
    </section>
  );
}
