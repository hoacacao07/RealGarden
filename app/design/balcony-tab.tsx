"use client";

/** Design studio Plan tab in balcony mode (Phase 11.5): balcony canvas, 3 PM sun by month, pot sizes and mounts, weight. */
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AlertTriangle, Box, Droplets, Scale, Sun, Trash2, Undo2 } from "lucide-react";

import type { PotItem } from "@/components/balcony/balcony-canvas";
import { CATEGORY_COLOR } from "@/components/garden-canvas";
import { Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useDesign } from "@/lib/design-store";
import { SAUCER_REMINDER } from "@/lib/engine/balcony";
import { lightFromHours, litDepth, POT_TOP_FT, potDistance, sunAtLocalHour, sunHours } from "@/lib/engine/balconySun";
import { potDiameterIn, potPlan } from "@/lib/engine/containerWater";
import { balconyWeight } from "@/lib/engine/weight";
import { label, MONTH_NAMES } from "@/lib/format";
import { useUI } from "@/lib/store";
import type { Mount, Plant } from "@/lib/types";

import type { useModel } from "./model";

const BalconyCanvas = dynamic(() => import("@/components/balcony/balcony-canvas"), { ssr: false, loading: () => <Loading label="Loading balcony…" /> });

const SIZES = [1, 3, 5, 7, 10, 15];
const MOUNTS: { v: Mount; l: string }[] = [{ v: "floor", l: "Floor pot" }, { v: "railing", l: "Railing planter" }, { v: "hanging", l: "Hanging basket" }];
const LIGHT_RANK = { full_sun: 2, partial_shade: 1, full_shade: 0 } as const;

export function BalconyTab({ model, onDrop }: { model: ReturnType<typeof useModel>; onDrop: (p: Plant, x: number, y: number) => void }) {
  const s = useDesign();
  const open = useUI((u) => u.openInspector);
  const [month, setMonth] = useState(s.month);
  const site = s.site!;
  const byId = model.byId;

  const sun3 = sunAtLocalHour(site.lat, site.lon, month, 15);
  const lit = litDepth(site, sun3.azimuth_deg, sun3.altitude_deg);
  const litLabel = lit <= 0 ? "none on the floor" : lit >= (site.balcony_w_ft ?? 5) ? "the whole floor" : `first ${lit.toFixed(1)} ft from the railing`;

  const pots = useMemo(() => s.placements.filter((d) => byId.has(d.plant_id)).map((d) => {
    const plant = byId.get(d.plant_id)!;
    const gal = d.container_gal ?? plant.min_container_gal ?? 3;
    const mount = d.mount ?? "floor";
    const hours = sunHours(site.lat, site.lon, site, month, potDistance(mount, d.y_ft), POT_TOP_FT[mount]);
    const tooSmall = plant.min_container_gal != null && gal < plant.min_container_gal;
    // Warn when a sun lover gets under 4 h, or any plant gets two light classes less than it wants.
    const need = Math.max(...plant.light.map((l) => LIGHT_RANK[l]));
    const lowLight = need - LIGHT_RANK[lightFromHours(hours)] >= 2 || (need === 2 && hours < 4);
    return { d, plant, gal, mount, hours, tooSmall, lowLight };
  }), [s.placements, byId, site, month]);

  const items: PotItem[] = pots.map((x) => ({
    key: x.d.key, name: x.plant.common_name, x_ft: x.d.x_ft, y_ft: x.d.y_ft, diameter_ft: potDiameterIn(x.gal) / 12, mount: x.mount,
    color: CATEGORY_COLOR[x.plant.category] ?? "#4f9a6a", warn: x.tooSmall || x.lowLight,
  }));
  const sel = pots.find((x) => x.d.key === s.selected);
  const weight = balconyWeight(pots.map((x) => x.gal));
  const rules = site.rules;
  const warnings = [
    ...pots.filter((x) => x.tooSmall).map((x) => `${x.plant.common_name}: a ${x.gal} gal pot is small; it wants ${x.plant.min_container_gal} gal or more.`),
    ...pots.filter((x) => x.lowLight).map((x) => `${x.plant.common_name}: about ${x.hours.toFixed(1)} h of direct sun here in ${MONTH_NAMES[month - 1]}, but it prefers ${x.plant.light.map(label).join(" or ").toLowerCase()}.`),
  ];
  const uniqWarn = [...new Set(warnings)];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 flex-1 min-w-64">
          <Sun className="size-4 text-[oklch(0.7_0.15_80)] shrink-0" aria-hidden />
          <span className="text-sm font-medium w-28 shrink-0">3 PM, {MONTH_NAMES[month - 1]} 15</span>
          <Slider aria-label="Month for the 3 PM sun" min={1} max={12} step={1} value={[month]} onValueChange={([v]) => setMonth(v)} />
        </div>
        <Button variant="ghost" size="sm" onClick={s.undo} disabled={!s.history.length}><Undo2 aria-hidden /> Undo</Button>
      </div>

      <BalconyCanvas lengthFt={s.width} depthFt={s.height} facingDeg={site.facing_deg ?? 180} overhangDepthFt={site.overhang_depth_ft ?? 0}
        litDepthFt={lit} litLabel={litLabel} pots={items} selected={s.selected}
        onSelect={(k) => s.set({ selected: k })} onMove={s.move}
        onOpen={(k) => { const x = pots.find((p) => p.d.key === k); if (x) open({ plant: x.plant, plantedOn: x.d.planted_on }); }}
        onDropPlant={(id, x, y) => { const p = byId.get(id); if (p) onDrop(p, x, y); }}
        label={`Balcony canvas, ${s.width} by ${s.height} feet, ${items.length} pots`} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-3 text-sm space-y-2">
          {sel ? (
            <>
              <p className="font-semibold">{sel.plant.common_name}</p>
              <p className="text-muted-foreground">
                About <strong className="text-foreground">{sel.hours.toFixed(1)} h</strong> of direct sun in {MONTH_NAMES[month - 1]} ({label(lightFromHours(sel.hours)).toLowerCase()}).{" "}
                <Droplets className="inline size-3.5" aria-hidden /> {potPlan(sel.plant, sel.gal, site.facing_deg).summary}.
              </p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pot size">
                {SIZES.map((g) => (
                  <button key={g} role="radio" aria-checked={sel.gal === g} onClick={() => s.patch(sel.d.key, { container_gal: g })}
                    className="px-2.5 py-1 rounded-lg border text-xs aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary">{g} gal</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Where the pot goes">
                {MOUNTS.map((m) => {
                  const banned = (m.v === "railing" && rules?.railing_pots === false) || (m.v === "hanging" && rules?.hanging_baskets === false);
                  return (
                    <button key={m.v} role="radio" aria-checked={sel.mount === m.v} disabled={banned} title={banned ? "Not allowed by your building rules" : undefined}
                      onClick={() => s.patch(sel.d.key, { mount: m.v, ...(m.v !== "floor" && { y_ft: 0.5 }) })}
                      className="px-2.5 py-1 rounded-lg border text-xs aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary disabled:opacity-40">{m.l}</button>
                  );
                })}
              </div>
              {sel.mount !== "floor" && (rules?.[sel.mount === "railing" ? "railing_pots" : "hanging_baskets"] == null) && (
                <p className="text-xs text-muted-foreground">Check with your HOA or landlord that this is allowed.</p>
              )}
              {sel.plant.dwarf_variety && <p className="text-xs text-muted-foreground">{sel.plant.dwarf_variety}.</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open({ plant: sel.plant, plantedOn: sel.d.planted_on })}><Box aria-hidden /> Inspect in 3D</Button>
                <Button size="sm" variant="outline" onClick={() => s.remove(sel.d.key)}><Trash2 aria-hidden /> Remove</Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Click a pot to change its size or move it to the railing. Drag pots toward the railing for more sun. {items.length} pots placed.</p>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-3 text-sm space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><Scale className="size-4" aria-hidden /> About {weight.lb} lb ({weight.kg} kg) when wet</p>
            <p className={weight.over_threshold ? "text-[oklch(0.45_0.15_30)] font-medium" : "text-muted-foreground"}>{weight.note}</p>
            {rules?.no_drip && <p className="text-muted-foreground">{SAUCER_REMINDER}.</p>}
          </div>
          <div className={`rounded-xl border p-3 text-sm space-y-1 ${uniqWarn.length ? "border-coral/60 bg-coral/5" : "bg-card"}`} aria-live="polite">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className={`size-4 ${uniqWarn.length ? "text-coral" : "text-muted-foreground"}`} aria-hidden />
              {uniqWarn.length ? `${uniqWarn.length} pot warning${uniqWarn.length > 1 ? "s" : ""}` : "Pot sizes and sun look right"}
            </p>
            {uniqWarn.slice(0, 5).map((w) => <p key={w}>{w}</p>)}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sun hours count every 15 minutes on the 15th of the month, ignoring the sun within 5° of the horizon. Pot weights assume wet potting mix at about 1 kg per liter (estimate).</p>
    </div>
  );
}
