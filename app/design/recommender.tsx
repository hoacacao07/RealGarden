"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, GripVertical, Plus, Search } from "lucide-react";

import { OriginBadge, Swatch } from "@/components/plant-bits";
import { PlantIcon } from "@/components/plant-icon";
import { ScoreBar } from "@/components/states";
import { Input } from "@/components/ui/input";
import { nativeSwap, type Recommendations, type Scored } from "@/lib/engine/recommend";
import type { Plant, Region } from "@/lib/types";

function Row({ s, region, onAdd, onPick, active }: { s: Scored; region: Region; onAdd: (p: Plant) => void; onPick?: (p: Plant) => void; active?: boolean }) {
  const p = s.plant;
  return (
    <li draggable onDragStart={(e) => { e.dataTransfer.setData("text/plant-id", p.id); e.dataTransfer.effectAllowed = "copy"; }}
      className={`group rounded-xl border bg-card p-2.5 flex gap-2 items-start cursor-grab active:cursor-grabbing hover:border-primary/50 ${active ? "border-primary ring-2 ring-primary/20" : ""}`}>
      <GripVertical className="size-4 mt-2 text-muted-foreground/50 shrink-0" aria-hidden />
      <div className="rounded-lg bg-secondary p-1 shrink-0"><PlantIcon category={p.category} className="size-8" /></div>
      <div className="min-w-0 flex-1 space-y-1">
        <button className="text-left font-medium leading-tight hover:underline" onClick={() => onPick?.(p)}>{p.common_name}</button>
        <div className="flex flex-wrap items-center gap-1">
          <OriginBadge plant={p} region={region} />
          {p.flower_colors.slice(0, 2).map((c) => <Swatch key={c.hex} hex={c.hex} />)}
        </div>
        <ScoreBar value={s.score} label="Site fit" />
        {s.reasons.length > 0 && <p className="text-xs text-muted-foreground">{s.reasons.join(" · ")}</p>}
      </div>
      <button onClick={() => onAdd(p)} className="p-1.5 rounded-lg border hover:bg-primary hover:text-primary-foreground shrink-0" aria-label={`Add ${p.common_name}`}>
        <Plus className="size-4" />
      </button>
    </li>
  );
}

export function Recommender({ recs, plants, region, onAdd, onPick, activeId, ediblesOpen = false, ediblesLabel = "Edibles for the vegetable bed" }: {
  recs: Recommendations; plants: Plant[]; region: Region; onAdd: (p: Plant) => void; onPick?: (p: Plant) => void; activeId?: string | null;
  ediblesOpen?: boolean; ediblesLabel?: string;
}) {
  // /design?garden=maria&q=mexican+petunia opens with the search filled in (presenter shortcut).
  const initialQ = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [showNon, setShowNon] = useState(false);
  const [showEd, setShowEd] = useState(ediblesOpen);
  const query = q.trim().toLowerCase();
  const scoreOf = useMemo(() => new Map([...recs.natives, ...recs.nonNatives].map((s) => [s.plant.id, s])), [recs]);

  const hits = query ? plants.filter((p) => p.common_name.toLowerCase().includes(query) || p.scientific_name.toLowerCase().includes(query)) : [];
  const swaps = hits.map((p) => nativeSwap(p, plants)).filter((x) => !!x);
  const natives = query ? recs.natives.filter((s) => hits.includes(s.plant)) : recs.natives;
  const nonNatives = query ? recs.nonNatives.filter((s) => hits.includes(s.plant)) : recs.nonNatives;
  const edibles = query ? recs.edibles.filter((s) => hits.includes(s.plant)) : recs.edibles;
  const filteredOut = hits.filter((p) => p.origin === "native" && !scoreOf.has(p.id));

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search plants</span>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. Mexican petunia" className="pl-9 h-10" />
      </label>

      {swaps.map((sw) => (
        <div key={sw.plant.id} className="rounded-xl border-2 border-coral/60 bg-coral/5 p-3 space-y-2" role="status">
          <p className="text-sm font-semibold">{sw.message}</p>
          <div className="flex flex-wrap gap-2">
            {sw.alternatives.map((a) => (
              <button key={a.id} onClick={() => onAdd(a)} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm hover:border-primary">
                {a.flower_colors[0] && <Swatch hex={a.flower_colors[0].hex} />} Add {a.common_name} <ArrowRight className="size-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          {query ? "Matching natives" : "Best natives for your site"} ({natives.length})
        </p>
        <ul className="space-y-2">
          {natives.map((s) => <Row key={s.plant.id} s={s} region={region} onAdd={onAdd} onPick={onPick} active={activeId === s.plant.id} />)}
        </ul>
        {filteredOut.map((p) => (
          <p key={p.id} className="text-xs text-muted-foreground mt-2">{p.common_name} is a Florida native but not a fit here (not native to your region, too big, or salt-sensitive).</p>
        ))}
      </div>

      {edibles.length > 0 && (
        <div className="rounded-xl border border-[oklch(0.8_0.08_60)] bg-[oklch(0.97_0.03_70)]">
          <button onClick={() => setShowEd((v) => !v)} aria-expanded={showEd || !!query}
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium">
            {ediblesLabel} ({edibles.length}) <ChevronDown className={`size-4 transition ${showEd || query ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {(showEd || !!query) && (
            <ul className="space-y-2 p-2 pt-0">
              {edibles.map((s) => <Row key={s.plant.id} s={s} region={region} onAdd={onAdd} onPick={onPick} active={activeId === s.plant.id} />)}
            </ul>
          )}
          <p className="px-3 pb-2 text-xs text-muted-foreground">Vegetables and herbs don&apos;t count toward native %. Plant a native wildflower nearby for pollinators.</p>
        </div>
      )}

      {nonNatives.length > 0 && (
        <div className="rounded-xl border bg-muted/40">
          <button onClick={() => setShowNon((v) => !v)} aria-expanded={showNon || !!query}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
            Non-natives that fit ({nonNatives.length}) <ChevronDown className={`size-4 transition ${showNon || query ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {(showNon || !!query) && (
            <ul className="space-y-2 p-2 pt-0">
              {nonNatives.map((s) => <Row key={s.plant.id} s={s} region={region} onAdd={onAdd} onPick={onPick} />)}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Invasive plants are never recommended. Drag a plant onto the canvas or press +.</p>
    </div>
  );
}
