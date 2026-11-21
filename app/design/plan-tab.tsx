"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, Grid3x3, Minus, MousePointer2, Pause, Play, Plus, Trash2, Undo2, Wand2 } from "lucide-react";

import type { CanvasItem, FillRect } from "@/components/garden-canvas";
import { CATEGORY_COLOR } from "@/components/garden-canvas";
import { Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { newKey, useDesign } from "@/lib/design-store";
import { recommend } from "@/lib/engine/recommend";
import { fillBed, offsetCount, squareCount } from "@/lib/engine/spacing";
import { templateLayout } from "@/lib/layout";
import { useUI } from "@/lib/store";
import type { Plant, Theme } from "@/lib/types";

import type { useModel } from "./model";

export const GardenCanvas = dynamic(() => import("@/components/garden-canvas"), { ssr: false, loading: () => <Loading label="Loading canvas…" /> });

const TEMPLATES: { theme: Theme; label: string }[] = [
  { theme: "wildlife", label: "Butterfly garden" },
  { theme: "seaside", label: "Seaside" },
  { theme: "water", label: "Rain garden" },
];

export function YearControl() {
  const year = useDesign((s) => s.year);
  const set = useDesign((s) => s.set);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const y = useDesign.getState().year;
      if (y >= 10) { setPlaying(false); return; }
      set({ year: Math.min(10, y + 0.5) });
    }, 250);
    return () => clearInterval(t);
  }, [playing, set]);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      <button onClick={() => { if (year >= 10) set({ year: 0 }); setPlaying((v) => !v); }} className="p-1.5 rounded-lg border hover:bg-muted" aria-label={playing ? "Pause growth" : "Play growth"}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <span className="text-sm font-medium w-20 shrink-0">Year {year % 1 ? year.toFixed(1) : year}</span>
      <Slider aria-label="Years after planting" min={0} max={10} step={0.5} value={[year]} onValueChange={([v]) => { setPlaying(false); set({ year: v }); }} />
    </div>
  );
}

export function PlanTab({ plants, model, active, onDrop }: {
  plants: Plant[]; model: ReturnType<typeof useModel>; active: Plant | null; onDrop: (p: Plant, x: number, y: number) => void;
}) {
  const s = useDesign();
  const open = useUI((u) => u.openInspector);
  const [rect, setRect] = useState<FillRect | null>(null);
  const [qty, setQty] = useState(0);
  const fillPlant = active ?? model.recs.natives[0]?.plant ?? null;

  const preview = useMemo(() => {
    if (!rect || !fillPlant) return [];
    return fillBed(rect, fillPlant.spacing_ft, qty || Infinity);
  }, [rect, fillPlant, qty]);
  const maxFit = rect && fillPlant ? fillBed(rect, fillPlant.spacing_ft).length : 0;

  const items: CanvasItem[] = model.items.map((g) => ({
    key: g.d.key, name: g.plant.common_name, x_ft: g.d.x_ft, y_ft: g.d.y_ft, radius_ft: g.radius_ft,
    color: CATEGORY_COLOR[g.plant.category] ?? "#4f9a6a", warn: g.warn,
    ring: g.plant.origin === "non_native" ? "#8a8a8a" : undefined,
  }));
  const sel = model.items.find((g) => g.d.key === s.selected);

  function applyTemplate(theme: Theme) {
    if (!s.site) return;
    if (s.placements.length && !window.confirm("Replace the current layout with this template?")) return;
    const r = recommend(s.site, plants, theme);
    const picks: { plant: Plant; count: number }[] = [];
    const perCat: Record<string, number> = {};
    for (const x of r.natives) {
      if (!x.plant.garden_themes.includes(theme) || x.terms.space < 0.7) continue;
      const c = x.plant.category;
      if ((perCat[c] ?? 0) >= 2) continue;
      perCat[c] = (perCat[c] ?? 0) + 1;
      const spread = (x.plant.mature_spread_ft[0] + x.plant.mature_spread_ft[1]) / 2;
      picks.push({ plant: x.plant, count: spread < 2 ? 3 : spread < 5 ? 2 : 1 });
      if (picks.length >= 7) break;
    }
    s.replaceAll(templateLayout(picks, s.width, s.height));
    s.set({ theme });
  }

  function applyFill() {
    if (!fillPlant || !preview.length) return;
    const group = `g_${newKey()}`;
    s.add(preview.map((p) => ({ plant_id: fillPlant.id, x_ft: p.x_ft, y_ft: p.y_ft, group_id: group })));
    setRect(null);
    setQty(0);
  }

  const warnings = [...model.shade.map((w) => w.message), ...model.crowding];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border bg-card p-0.5" role="radiogroup" aria-label="Tool">
          <button role="radio" aria-checked={s.tool === "move"} onClick={() => { s.set({ tool: "move" }); setRect(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm aria-checked:bg-primary aria-checked:text-primary-foreground">
            <MousePointer2 className="size-4" aria-hidden /> Move
          </button>
          <button role="radio" aria-checked={s.tool === "fill"} onClick={() => s.set({ tool: "fill" })}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm aria-checked:bg-primary aria-checked:text-primary-foreground">
            <Grid3x3 className="size-4" aria-hidden /> Bed fill
          </button>
        </div>
        <span className="text-sm text-muted-foreground ml-1">Templates:</span>
        {TEMPLATES.map((t) => (
          <Button key={t.theme} variant="outline" size="sm" onClick={() => applyTemplate(t.theme)}><Wand2 aria-hidden /> {t.label}</Button>
        ))}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={s.undo} disabled={!s.history.length}><Undo2 aria-hidden /> Undo</Button>
      </div>

      {s.tool === "fill" && (
        <div className="rounded-xl border-2 border-primary/40 bg-secondary/60 p-3 flex flex-wrap items-center gap-3 text-sm">
          <span>Drag a rectangle on the canvas to fill it with <strong>{fillPlant?.common_name ?? "a plant"}</strong> ({fillPlant?.spacing_ft} ft apart, offset rows).</span>
          <span className="text-muted-foreground">Pick another plant by clicking its name in the list.</span>
          {rect && fillPlant && (
            <>
              <span className="text-muted-foreground">
                {rect.w}×{rect.h} ft: square grid ≈ {squareCount(rect.w * rect.h, fillPlant.spacing_ft)}, offset ≈ {offsetCount(rect.w * rect.h, fillPlant.spacing_ft)}
              </span>
              <div className="inline-flex items-center rounded-lg border bg-card">
                <button className="p-1.5" aria-label="Fewer" onClick={() => setQty(Math.max(1, (qty || maxFit) - 1))}><Minus className="size-4" /></button>
                <span className="w-10 text-center tabular-nums font-semibold" aria-live="polite">{preview.length}</span>
                <button className="p-1.5" aria-label="More" onClick={() => setQty(Math.min(maxFit, (qty || maxFit) + 1))}><Plus className="size-4" /></button>
              </div>
              <Button size="sm" onClick={applyFill} disabled={!preview.length}>Plant {preview.length}</Button>
            </>
          )}
        </div>
      )}

      <GardenCanvas widthFt={s.width} heightFt={s.height} items={items} zones={s.zones} selected={s.selected} tool={s.tool}
        onSelect={(k) => s.set({ selected: k })} onMove={s.move}
        onOpen={(k) => { const g = model.items.find((x) => x.d.key === k); if (g) open({ plant: g.plant, plantedOn: g.d.planted_on }); }}
        onDropPlant={(id, x, y) => { const p = model.byId.get(id); if (p) onDrop(p, x, y); }}
        onFillRect={(r, done) => { setRect(r); if (done && r) setQty(0); }}
        fillPreview={preview.map((p) => ({ ...p, r: (fillPlant?.spacing_ft ?? 2) / 2 }))}
        label={`Garden canvas, ${s.width} by ${s.height} feet, ${items.length} plants`} />

      <YearControl />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-3 text-sm space-y-2">
          {sel ? (
            <>
              <p className="font-semibold">{sel.plant.common_name}</p>
              <p className="text-muted-foreground">Year {s.year}: about {sel.height_ft.toFixed(1)} ft tall, {(sel.radius_ft * 2).toFixed(1)} ft wide.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open({ plant: sel.plant, plantedOn: sel.d.planted_on })}><Box aria-hidden /> Inspect in 3D</Button>
                <Button size="sm" variant="outline" onClick={() => s.remove(sel.d.key)}><Trash2 aria-hidden /> Remove</Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Click a plant to select it. Double-click to open the 3D inspector. {s.placements.length} plants placed.</p>
          )}
        </div>
        <div className={`rounded-xl border p-3 text-sm space-y-1 ${warnings.length ? "border-coral/60 bg-coral/5" : "bg-card"}`} aria-live="polite">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className={`size-4 ${warnings.length ? "text-coral" : "text-muted-foreground"}`} aria-hidden />
            {warnings.length ? `${warnings.length} layout warning${warnings.length > 1 ? "s" : ""} at year ${s.year}` : `No crowding or shade problems at year ${s.year}`}
          </p>
          {warnings.slice(0, 5).map((w) => <p key={w}>{w}</p>)}
        </div>
      </div>
    </div>
  );
}
