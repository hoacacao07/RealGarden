"use client";

/**
 * "Add your house and roof for better estimates" (spec 6D.2). An extra layer over the garden plan: drag the house
 * rectangle into place (north is up; it can sit outside the garden, e.g. behind a front yard), set its size, and
 * enter the driveway, patio and path, the lawn you keep, and optional rain barrel, rain garden and compost bin.
 */
import { useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EcoLayer } from "@/lib/types";

type Kind = EcoLayer["surfaces"][number]["kind"];
const KINDS: { k: Kind; l: string }[] = [{ k: "driveway", l: "Driveway" }, { k: "patio", l: "Patio" }, { k: "path", l: "Paths" }];

const n = (v: string, lo = 0) => Math.max(lo, Number(v) || 0);

export function HouseLayer({ gardenId, eco, canvas, dots, zones, onDone }: {
  gardenId: string; eco: EcoLayer; canvas: { w: number; h: number }; dots: { x: number; y: number }[]; zones: [number, number][][]; onDone: () => void;
}) {
  const [e, setE] = useState<EcoLayer>(() => ({ ...eco, house: eco.house ?? { x: 2, y: -Math.round(canvas.h * 0.9) - 2, w: Math.min(40, canvas.w - 4), h: Math.round(canvas.h * 0.9) } }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const house = e.house!;
  const surf = (k: Kind) => e.surfaces.find((s) => s.kind === k)?.sqft ?? 0;
  const setSurf = (k: Kind, sqft: number) => setE((x) => ({ ...x, surfaces: [...x.surfaces.filter((s) => s.kind !== k), ...(sqft > 0 ? [{ kind: k, sqft }] : [])] }));

  const pad = 6;
  const x0 = Math.min(0, house.x) - pad, y0 = Math.min(0, house.y) - pad;
  const x1 = Math.max(canvas.w, house.x + house.w) + pad, y1 = Math.max(canvas.h, house.y + house.h) + pad;

  const toFt = (ev: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: x0 + ((ev.clientX - r.left) / r.width) * (x1 - x0), y: y0 + ((ev.clientY - r.top) / r.height) * (y1 - y0) };
  };

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/gardens/${gardenId}/eco`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onDone();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }

  const footprint = Math.round(house.w * house.h);
  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4" aria-labelledby="house-h">
      <div>
        <h2 id="house-h" className="text-lg font-semibold">Your house and yard</h2>
        <p className="text-sm text-muted-foreground">Drag the house into place. North is up. Rough numbers are fine: they only improve the estimates.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <svg ref={svg} viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} className="w-full rounded-xl border bg-[oklch(0.96_0.03_130)] touch-none select-none"
          style={{ aspectRatio: `${x1 - x0} / ${y1 - y0}`, maxHeight: 420 }} role="img" aria-label="Garden plan with your house"
          onPointerMove={(ev) => {
            if (!drag.current) return;
            const p = toFt(ev);
            setE((x) => ({ ...x, house: { ...x.house!, x: Math.round(p.x - drag.current!.dx), y: Math.round(p.y - drag.current!.dy) } }));
          }}
          onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <rect x={0} y={0} width={canvas.w} height={canvas.h} fill="oklch(0.92 0.05 140)" stroke="oklch(0.6 0.08 140)" strokeDasharray="1 0.6" strokeWidth={0.25} />
          {zones.map((z, i) => <polygon key={i} points={z.map((p) => p.join(",")).join(" ")} fill="oklch(0.85 0.07 140)" stroke="oklch(0.55 0.08 140)" strokeWidth={0.2} />)}
          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={0.6} fill="oklch(0.45 0.12 150)" />)}
          <g className="cursor-move" onPointerDown={(ev) => { (ev.target as Element).setPointerCapture?.(ev.pointerId); const p = toFt(ev); drag.current = { dx: p.x - house.x, dy: p.y - house.y }; }}>
            <rect x={house.x} y={house.y} width={house.w} height={house.h} fill="oklch(0.85 0.03 60)" stroke="oklch(0.4 0.03 60)" strokeWidth={0.4} rx={0.5} />
            <text x={house.x + house.w / 2} y={house.y + house.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(2, Math.min(house.w, house.h) / 6)} fill="oklch(0.3 0.03 60)">House</text>
          </g>
          <text x={x1 - 2} y={y0 + 3} textAnchor="end" fontSize={2.5} fill="oklch(0.4 0.03 60)">N ↑</text>
        </svg>
        <div className="grid gap-3 sm:grid-cols-2 content-start">
          <div className="space-y-1"><Label htmlFor="hw">House width (ft)</Label><Input id="hw" type="number" min={8} value={house.w} onChange={(v) => setE({ ...e, house: { ...house, w: n(v.target.value, 8) } })} /></div>
          <div className="space-y-1"><Label htmlFor="hh">House depth (ft)</Label><Input id="hh" type="number" min={8} value={house.h} onChange={(v) => setE({ ...e, house: { ...house, h: n(v.target.value, 8) } })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="roof">Roof area (sq ft)</Label>
            <Input id="roof" type="number" min={0} placeholder={`${footprint} (from the footprint)`} value={e.roof_sqft ?? ""} onChange={(v) => setE({ ...e, roof_sqft: v.target.value === "" ? null : n(v.target.value, 50) })} /></div>
          {KINDS.map((k) => (
            <div key={k.k} className="space-y-1"><Label htmlFor={k.k}>{k.l} (sq ft)</Label><Input id={k.k} type="number" min={0} value={surf(k.k) || ""} placeholder="0" onChange={(v) => setSurf(k.k, n(v.target.value))} /></div>
          ))}
          <div className="space-y-1"><Label htmlFor="lawn">Lawn you keep (sq ft)</Label><Input id="lawn" type="number" min={0} value={e.lawn_sqft || ""} placeholder="0" onChange={(v) => setE({ ...e, lawn_sqft: n(v.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="barrel">Rain barrel (gal)</Label><Input id="barrel" type="number" min={0} value={e.barrel_gal || ""} placeholder="none" onChange={(v) => setE({ ...e, barrel_gal: n(v.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="rg">Rain garden (sq ft)</Label><Input id="rg" type="number" min={0} value={e.rain_garden_sqft || ""} placeholder="none" onChange={(v) => setE({ ...e, rain_garden_sqft: n(v.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="hhsize">People at home</Label><Input id="hhsize" type="number" min={1} value={e.household} onChange={(v) => setE({ ...e, household: n(v.target.value, 1) })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.compost_bin} onChange={(v) => setE({ ...e, compost_bin: v.target.checked })} /> Compost bin</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.mulch} onChange={(v) => setE({ ...e, mulch: v.target.checked })} /> Beds are mulched</label>
        </div>
      </div>
      {err && <ErrorState message={err} />}
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save and update estimates</Button>
      </div>
    </section>
  );
}
