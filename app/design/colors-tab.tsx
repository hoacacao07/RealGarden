"use client";

import { useMemo, useState } from "react";
import { Columns2, Paintbrush, Plus, X } from "lucide-react";

import type { CanvasItem } from "@/components/garden-canvas";
import { OriginBadge, Swatch } from "@/components/plant-bits";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useDesign, type Draft } from "@/lib/design-store";
import { beautyTimeline } from "@/lib/engine/beauty";
import { bestFlowerMatch, bloomOverlap, colorInMonth, colorScore, isHarmony, nativeness, type Harmony } from "@/lib/engine/color";
import { canopyAreaAt } from "@/lib/engine/growth";
import { monthName } from "@/lib/engine/phenology";
import { MONTH_NAMES } from "@/lib/format";
import { useUI } from "@/lib/store";
import type { Plant } from "@/lib/types";

import { useModel } from "./model";
import { GardenCanvas } from "./plan-tab";

const BRUSHES = [
  { name: "Yellow", hex: "#F4C21D" }, { name: "Purple", hex: "#8E4FB0" }, { name: "Red", hex: "#D7263D" },
  { name: "Orange", hex: "#F07F1E" }, { name: "Pink", hex: "#D774A3" }, { name: "Blue", hex: "#5A4FC4" }, { name: "White", hex: "#F4F2EA" },
];
const HARMONIES: { kind: Harmony; label: string; hint: string }[] = [
  { kind: "complementary", label: "Complementary", hint: "opposite hue, the boldest contrast" },
  { kind: "analogous", label: "Analogous", hint: "neighbor hues, calm and blended" },
  { kind: "triadic", label: "Triadic", hint: "a third of the wheel away" },
];

function MonthStrip({ months, label }: { months: number[]; label: string }) {
  return (
    <ol className="grid grid-cols-12 gap-0.5" aria-label={label}>
      {MONTH_NAMES.map((m, i) => (
        <li key={m} title={m} className={`h-2 rounded-sm ${months.includes(i + 1) ? "bg-primary" : "bg-muted"}`} />
      ))}
    </ol>
  );
}

/** Colors preview the established garden: at least year 2, or later if the year slider says so. */
export const shownYear = (year: number) => Math.max(year, 2);

function useMonthItems(plants: Plant[], placements: Draft[] | undefined, month: number): { items: CanvasItem[]; score: number } {
  const model = useModel(plants, undefined, placements);
  const s = useDesign();
  const items = model.items.map((g) => {
    const c = colorInMonth(g.plant, month, shownYear(s.year) >= g.plant.years_to_first_bloom);
    return { key: g.d.key, name: g.plant.common_name, x_ft: g.d.x_ft, y_ft: g.d.y_ft, radius_ft: g.radius_ft, color: c.hex, faded: c.kind === "foliage" };
  });
  const bed = s.width * s.height;
  const y = shownYear(s.year);
  const tl = beautyTimeline(model.items.map((g) => ({ plant: g.plant, canopy_sqft: canopyAreaAt(g.plant, y), can_bloom: y >= g.plant.years_to_first_bloom })), bed, [], s.site!.region);
  return { items, score: tl.months[month - 1].score };
}

export function ColorsTab({ plants, model, active, setActive, onAdd }: {
  plants: Plant[]; model: ReturnType<typeof useModel>; active: Plant | null; setActive: (p: Plant | null) => void; onAdd: (p: Plant) => void;
}) {
  const s = useDesign();
  const open = useUI((u) => u.openInspector);
  const [brush, setBrush] = useState<string | null>(null);
  const region = s.site!.region;
  const siteScore = useMemo(() => new Map([...model.recs.natives, ...model.recs.nonNatives].map((x) => [x.plant.id, x.score])), [model.recs]);
  const current = useMonthItems(plants, undefined, s.month);
  const versionA = useMonthItems(plants, s.snapshot ?? [], s.month);

  const suggestions = useMemo(() => {
    if (!brush) return [];
    return plants
      .filter((p) => siteScore.has(p.id) && p.flower_colors.length)
      .map((p) => {
        const m = bestFlowerMatch(p, brush);
        return { plant: p, c: m.c, color: m.color, score: colorScore(siteScore.get(p.id)!, m.c, nativeness(p, region)) };
      })
      .filter((x) => x.c > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [brush, plants, siteScore, region]);

  const partners = useMemo(() => {
    if (!active?.flower_colors.length) return [];
    const base = active.flower_colors[0].hex;
    return HARMONIES.map((h) => ({
      ...h,
      plants: model.recs.natives
        .map((x) => x.plant)
        .filter((p) => p.id !== active.id && p.flower_colors.some((c) => isHarmony(base, c.hex, h.kind)))
        .map((p) => ({ plant: p, overlap: bloomOverlap(active, p) }))
        .sort((a, b) => b.overlap.length - a.overlap.length || (siteScore.get(b.plant.id) ?? 0) - (siteScore.get(a.plant.id) ?? 0))
        .slice(0, 4),
    }));
  }, [active, model.recs, siteScore]);
  const inGarden = new Set(s.placements.map((p) => p.plant_id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2">
        <span className="text-sm font-medium w-24 shrink-0">{monthName(s.month)}</span>
        <Slider aria-label="Month" min={1} max={12} step={1} value={[s.month]} onValueChange={([v]) => s.set({ month: v })} className="flex-1 min-w-40" />
        <span className="text-sm text-muted-foreground">Beauty {current.score}</span>
        {s.snapshot ? (
          <Button size="sm" variant="ghost" onClick={() => s.set({ snapshot: null })}><X aria-hidden /> End compare</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => s.set({ snapshot: s.placements })} disabled={!s.placements.length}><Columns2 aria-hidden /> Save as version A</Button>
        )}
      </div>

      {s.snapshot ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[{ t: "Version A", d: versionA }, { t: "Current", d: current }].map(({ t, d }) => (
            <figure key={t} className="space-y-1">
              <figcaption className="flex justify-between text-sm"><span className="font-medium">{t}</span><span className="text-muted-foreground">{monthName(s.month)} beauty {d.score}</span></figcaption>
              <GardenCanvas widthFt={s.width} heightFt={s.height} items={d.items} readOnly showLabels={false} label={`${t} colors in ${monthName(s.month)}`} />
            </figure>
          ))}
        </div>
      ) : (
        <GardenCanvas widthFt={s.width} heightFt={s.height} items={current.items} zones={s.zones} selected={s.selected} onMove={s.move}
          onSelect={(k) => { s.set({ selected: k }); const g = model.items.find((x) => x.d.key === k); if (g) setActive(g.plant); }}
          onOpen={(k) => { const g = model.items.find((x) => x.d.key === k); if (g) open({ plant: g.plant, plantedOn: g.d.planted_on }); }}
          label={`Garden colors in ${monthName(s.month)}`} />
      )}
      <p className="text-xs text-muted-foreground">Established garden (year {shownYear(s.year)}). Each plant shows its flower color in bloom, fruit color when fruiting, and faded foliage otherwise.</p>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-3 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><Paintbrush className="size-4" aria-hidden /> Color brush</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pick a color">
            {BRUSHES.map((b) => (
              <button key={b.name} role="radio" aria-checked={brush === b.hex} onClick={() => setBrush(b.hex)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm aria-checked:border-primary aria-checked:ring-2 aria-checked:ring-primary/30">
                <Swatch hex={b.hex} className="size-3.5" /> {b.name}
              </button>
            ))}
            <label className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm cursor-pointer">
              <input type="color" className="size-4 border-0 p-0 bg-transparent" value={brush ?? "#8E4FB0"} onChange={(e) => setBrush(e.target.value.toUpperCase())} aria-label="Custom color" /> Custom
            </label>
          </div>
          {brush && (
            <ul className="space-y-1.5">
              {suggestions.length === 0 && <li className="text-sm text-muted-foreground">No good match for this color on your site.</li>}
              {suggestions.map((x) => (
                <li key={x.plant.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${active?.id === x.plant.id ? "border-primary bg-secondary/60" : ""}`}>
                  <Swatch hex={x.plant.flower_colors.find((c) => c.name === x.color)?.hex ?? x.plant.flower_colors[0].hex} className="size-4" />
                  <button className="flex-1 text-left font-medium hover:underline" onClick={() => setActive(x.plant)}>{x.plant.common_name}</button>
                  <span className="text-xs text-muted-foreground tabular-nums">{Math.round(x.c * 100)}% match</span>
                  <OriginBadge plant={x.plant} region={region} />
                  <button className="p-1 rounded border hover:bg-primary hover:text-primary-foreground" aria-label={`Add ${x.plant.common_name}`} onClick={() => onAdd(x.plant)}><Plus className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Ranked by site fit × color match (CIELAB ΔE) × nativeness. Natives to your region score highest.</p>
        </section>

        <section className="rounded-xl border bg-card p-3 space-y-3">
          <h3 className="font-semibold">Harmony partners {active && <>for <span className="text-primary">{active.common_name}</span></>}</h3>
          {!active || !active.flower_colors.length ? (
            <p className="text-sm text-muted-foreground">Pick a flowering plant from the brush, the list or the canvas to see partners.</p>
          ) : (
            partners.map((h) => (
              <div key={h.kind} className="space-y-1.5">
                <p className="text-sm"><strong>{h.label}</strong> <span className="text-muted-foreground">· {h.hint}</span></p>
                {h.plants.length === 0 && <p className="text-xs text-muted-foreground">None among your site&apos;s natives.</p>}
                {h.plants.map(({ plant, overlap }) => (
                  <div key={plant.id} className="rounded-lg border p-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Swatch hex={active.flower_colors[0].hex} className="size-4" /><span className="text-muted-foreground">+</span>
                      <Swatch hex={plant.flower_colors[0].hex} className="size-4" />
                      <button className="font-medium hover:underline flex-1 text-left" onClick={() => setActive(plant)}>{plant.common_name}</button>
                      <span className="text-xs">{overlap.length ? `Bloom together ${overlap.map(monthName).join(", ")}` : "No shared bloom months"}</span>
                    </div>
                    <MonthStrip months={overlap} label={`Months both bloom: ${overlap.map(monthName).join(", ") || "none"}`} />
                    <div className="flex gap-2">
                      {!inGarden.has(active.id) && <Button size="sm" variant="outline" onClick={() => { onAdd(active); onAdd(plant); }}>Add both</Button>}
                      <Button size="sm" variant="outline" onClick={() => onAdd(plant)}><Plus aria-hidden /> Add {plant.common_name}</Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
