"use client";

/**
 * Balcony profile (Phase 11.5): replaces the soil step when the garden is a balcony, patio or containers.
 * Facing, floor, size, railing, overhang and building rules, with a live sun strip from the sun hours engine.
 */
import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { balconyLight, sunStrip, sunSummary, typicalPotD } from "@/lib/engine/balconySun";
import { label } from "@/lib/format";
import type { BalconyFacts, BalconyRules } from "@/lib/types";

import { SunStrip } from "./sun-strip";

type Filled<T> = { [K in keyof T]-?: NonNullable<T[K]> };
export type BalconyValue = Filled<Omit<BalconyFacts, "kind" | "rules">> & { rules: BalconyRules };

export const DEFAULT_BALCONY: BalconyValue = {
  facing_deg: 180, floor_level: 2, balcony_l_ft: 10, balcony_w_ft: 5, railing_ft: 10, overhang_depth_ft: 0, overhang_height_ft: 8.5,
  rules: { railing_pots: null, hanging_baskets: null, no_drip: null },
};

const DIRS: { deg: number; l: string }[] = [
  { deg: 0, l: "N" }, { deg: 45, l: "NE" }, { deg: 90, l: "E" }, { deg: 135, l: "SE" }, { deg: 180, l: "S" }, { deg: 225, l: "SW" }, { deg: 270, l: "W" }, { deg: 315, l: "NW" },
];
const FLOORS: { v: number; l: string }[] = [{ v: 1, l: "Ground" }, { v: 2, l: "2 to 3" }, { v: 4, l: "4 to 9" }, { v: 10, l: "10+" }];
const RULES: { k: keyof BalconyRules; l: string }[] = [
  { k: "railing_pots", l: "Pots allowed on the railing" },
  { k: "hanging_baskets", l: "Hanging baskets allowed" },
  { k: "no_drip", l: "No water dripping onto lower balconies" },
];

function num(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== "" ? n : fallback;
}

export function BalconyStep({ lat, lon, value, onChange }: { lat: number | null; lon: number | null; value: BalconyValue; onChange: (v: BalconyValue) => void }) {
  const set = (p: Partial<BalconyValue>) => onChange({ ...value, ...p });
  const strip = useMemo(() => (lat != null && lon != null ? sunStrip(lat, lon, value, typicalPotD(value)) : null), [lat, lon, value]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Which way does the balcony face?</legend>
          <div className="grid grid-cols-3 gap-1.5 w-fit" role="radiogroup" aria-label="Facing direction">
            {[315, 0, 45, 270, -1, 90, 225, 180, 135].map((deg) => {
              if (deg < 0) return <span key="c" className="size-12 grid place-items-center text-xs text-muted-foreground">you</span>;
              const d = DIRS.find((x) => x.deg === deg)!;
              return (
                <button key={deg} type="button" role="radio" aria-checked={value.facing_deg === deg} aria-label={`Faces ${d.l}`} onClick={() => set({ facing_deg: deg })}
                  className="size-12 rounded-xl border bg-card text-sm font-semibold aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground hover:border-primary/60">
                  {d.l}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Stand at the railing looking out. That direction is the facing.</p>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Floor</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Floor level">
            {FLOORS.map((f) => (
              <button key={f.v} type="button" role="radio" aria-checked={value.floor_level === f.v} onClick={() => set({ floor_level: f.v })}
                className="px-3.5 py-2 rounded-xl border bg-card text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground">{f.l}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Higher floors get more wind. From the 4th floor up we steer away from wind-tender plants.</p>
        </fieldset>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="bl">Floor length along the railing (ft)</Label>
          <Input id="bl" type="number" min={2} max={60} value={value.balcony_l_ft} className="h-10" onChange={(e) => set({ balcony_l_ft: Math.max(2, num(e.target.value, 10)) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bw">Depth from railing to wall (ft)</Label>
          <Input id="bw" type="number" min={2} max={30} value={value.balcony_w_ft} className="h-10" onChange={(e) => set({ balcony_w_ft: Math.max(2, num(e.target.value, 5)) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rl">Railing length (ft)</Label>
          <Input id="rl" type="number" min={0} max={120} value={value.railing_ft} className="h-10" onChange={(e) => set({ railing_ft: Math.max(0, num(e.target.value, value.balcony_l_ft)) })} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Overhang above (a roof or the balcony upstairs)</legend>
        <div className="flex flex-wrap items-end gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--leaf)]" checked={value.overhang_depth_ft > 0}
              onChange={(e) => set({ overhang_depth_ft: e.target.checked ? value.balcony_w_ft : 0 })} /> There is one
          </label>
          {value.overhang_depth_ft > 0 && (
            <>
              <div className="space-y-1">
                <Label htmlFor="od">How far it sticks out from the wall (ft)</Label>
                <Input id="od" type="number" min={0.5} max={30} step={0.5} value={value.overhang_depth_ft} className="h-9 w-28" onChange={(e) => set({ overhang_depth_ft: Math.max(0.5, num(e.target.value, 4)) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="oh">Height above your floor (ft)</Label>
                <Input id="oh" type="number" min={4} max={30} step={0.5} value={value.overhang_height_ft} className="h-9 w-28" onChange={(e) => set({ overhang_height_ft: Math.max(4, num(e.target.value, 8.5)) })} />
              </div>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Building rules</legend>
        <ul className="space-y-1.5">
          {RULES.map((r) => (
            <li key={r.k} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-64">{r.l}</span>
              {([[null, "Not sure"], [true, "Yes"], [false, "No"]] as const).map(([v, l]) => (
                <button key={l} type="button" aria-pressed={value.rules[r.k] === v} onClick={() => set({ rules: { ...value.rules, [r.k]: v } })}
                  className="px-2.5 py-1 rounded-lg border bg-card text-xs aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:font-semibold">{l}</button>
              ))}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Check with your HOA or landlord before hanging anything over the railing.</p>
      </fieldset>

      {strip ? (
        <div className="rounded-xl bg-secondary/60 p-4 space-y-2">
          <SunStrip hours={strip} summary={sunSummary(value.facing_deg, strip)} />
          <p className="text-xs text-muted-foreground">
            Direct sun for a pot halfway back on the floor, on the 15th of each month, counted every 15 minutes. Plants are ranked for{" "}
            <strong>{label(balconyLight(strip))}</strong>. Nearby buildings and trees can block more; this is an estimate.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Set your location above to see the sun hours.</p>
      )}
    </div>
  );
}
