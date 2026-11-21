/** Dashboard cards for balcony gardens (Phase 11.5): sun strip + weight, and per-pot watering. Server-safe. */
import { Droplets, Scale, Sun, Umbrella } from "lucide-react";

import { SunStrip } from "@/components/balcony/sun-strip";
import { SAUCER_REMINDER } from "@/lib/engine/balcony";
import { facingName, sunStrip, sunSummary, typicalPotD } from "@/lib/engine/balconySun";
import { balconyWeight } from "@/lib/engine/weight";
import { dayLabel } from "@/lib/format";
import type { PotOut } from "@/lib/predict";
import type { GardenDoc } from "@/lib/types";

export function BalconyCard({ garden, pots, month }: { garden: GardenDoc; pots: PotOut[]; month: number }) {
  const s = garden.site;
  const strip = sunStrip(s.lat, s.lon, s, typicalPotD(s));
  const w = balconyWeight(pots.map((p) => p.gal));
  return (
    <section aria-labelledby="balcony-h" className="rounded-2xl border bg-card p-4 space-y-3">
      <h2 id="balcony-h" className="text-xl font-semibold flex items-center gap-2"><Sun className="size-5 text-[oklch(0.7_0.15_80)]" aria-hidden /> Balcony</h2>
      <p className="text-sm text-muted-foreground">
        Faces {facingName(s.facing_deg ?? 180).toLowerCase()} · floor {s.floor_level ?? 1} · {s.balcony_l_ft} × {s.balcony_w_ft} ft
        {(s.overhang_depth_ft ?? 0) > 0 ? ` · ${s.overhang_depth_ft} ft overhang at ${s.overhang_height_ft} ft` : " · open sky"}
      </p>
      <SunStrip hours={strip} summary={sunSummary(s.facing_deg ?? 180, strip)} highlight={month} />
      <div className="rounded-xl bg-secondary/60 p-3 text-sm space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><Scale className="size-4" aria-hidden /> About {w.lb} lb ({w.kg} kg) of wet pots</p>
        <p className={w.over_threshold ? "font-medium text-[oklch(0.45_0.15_30)]" : "text-muted-foreground"}>{w.note}</p>
      </div>
      {(s.floor_level ?? 1) >= 4 && <p className="text-xs text-muted-foreground">On floor 4 and up, wind is stronger: plants that hate wind are ranked lower, and on floor 10+ left out.</p>}
    </section>
  );
}

export function PotWater({ pots, noDrip }: { pots: PotOut[]; noDrip: boolean }) {
  if (!pots.length) return <p className="text-sm text-muted-foreground">No pots yet.</p>;
  const dates = pots[0].days.map((d) => d.date);
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Pot</th>
              <th className="py-2 pr-3 font-medium">Typical</th>
              {dates.map((d) => <th key={d} className="py-2 px-1 font-medium text-center whitespace-nowrap">{dayLabel(d)}</th>)}
            </tr>
          </thead>
          <tbody>
            {pots.map((p) => (
              <tr key={p.id} className="border-t align-top">
                <td className="py-2 pr-3">
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.gal} gal {p.mount === "floor" ? "pot" : p.mount === "railing" ? "railing planter" : "hanging basket"} · {p.sun_hours.toFixed(1)} h sun
                    {!p.open && <> · <Umbrella className="inline size-3" aria-label="under the overhang" /> no rain</>}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs max-w-48">{p.summary}</td>
                {p.days.map((d) => (
                  <td key={d.date} className="py-2 px-1 text-center">
                    {d.water
                      ? <span className="inline-flex items-center justify-center rounded-full bg-sky/30 text-[oklch(0.35_0.1_230)] size-7" title={`Water: down to ${d.level_pct}%`}><Droplets className="size-4" aria-label="water" /></span>
                      : <span className="text-xs text-muted-foreground tabular-nums" title="Water left in the pot">{d.level_pct}%</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Container model: a pot holds about a quarter of its volume as water the plant can use, and dries out faster on hot west and south walls.
        Water when a pot drops below half. Rain only counts for pots outside the overhang. Estimates.
        {noDrip && <> <strong>{SAUCER_REMINDER}.</strong></>}
      </p>
    </div>
  );
}
