"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUp, Bug, CloudRain, Droplets, Home, Info, Leaf, Loader2, Sparkles, Sun, Trees, Waves, Wheat } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import type { EcoReport, Metric, MetricId, Swap } from "@/lib/engine/eco/report";
import type { EcoLayer } from "@/lib/types";

import { HouseLayer } from "./house-layer";

const ICON: Record<MetricId, React.ReactNode> = {
  water: <Droplets aria-hidden />, rain: <CloudRain aria-hidden />, stormwater: <Waves aria-hidden />, baysafe: <Leaf aria-hidden />,
  carbon: <Trees aria-hidden />, shade: <Sun aria-hidden />, pollinators: <Bug aria-hidden />, food: <Wheat aria-hidden />,
};
const GRADE_COLOR: Record<EcoReport["grade"], string> = { A: "oklch(0.55 0.14 150)", B: "oklch(0.62 0.13 130)", C: "oklch(0.72 0.14 90)", D: "oklch(0.66 0.15 55)", F: "oklch(0.58 0.18 30)" };

export function GradeBadge({ grade, score, size = "lg" }: { grade: EcoReport["grade"]; score: number; size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <div className={`grid place-items-center rounded-full text-white font-bold shrink-0 ${big ? "size-24 text-5xl" : "size-12 text-2xl"}`} style={{ background: GRADE_COLOR[grade] }}
      role="img" aria-label={`Eco score ${grade}, ${score} out of 100`}>
      {grade}
    </div>
  );
}

function diffText(m: Metric, before: number, now: number) {
  const d = now - before;
  const sign = d > 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(d * 10) / 10).toLocaleString("en-US")} ${m.unit} since your last visit`;
}

function Tile({ m, gardenId, change, onAddHouse }: { m: Metric; gardenId: string; change?: { before: number; now: number }; onAddHouse: () => void }) {
  const [plain, setPlain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function explain() {
    setBusy(true);
    try {
      const r = await fetch("/api/eco/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ garden_id: gardenId, metric: m.id }) });
      setPlain((await r.json()).text ?? null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className={`rounded-2xl border bg-card p-4 flex flex-col gap-2 ${change ? "ring-2 ring-primary/60" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-primary">{ICON[m.id]}{m.title}</p>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded-full px-1.5">estimate</span>
      </div>
      <p className="text-xl font-semibold tabular-nums">{m.value}</p>
      {m.score != null && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="meter" aria-valuenow={m.score} aria-valuemin={0} aria-valuemax={100} aria-label={`${m.title} score`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${m.score}%` }} />
        </div>
      )}
      {change && <p className="text-xs font-medium text-primary flex items-center gap-1"><ArrowUp className="size-3" aria-hidden />{diffText(m, change.before, change.now)}</p>}
      <p className="text-sm text-muted-foreground">{m.detail}</p>
      {m.needs === "house" && <Button size="sm" variant="outline" className="w-fit" onClick={onAddHouse}><Home aria-hidden /> Add your house</Button>}
      <details className="text-xs mt-auto">
        <summary className="cursor-pointer text-muted-foreground flex items-center gap-1"><Info className="size-3" aria-hidden /> How we calculate this</summary>
        <div className="mt-2 space-y-2">
          <p>{m.formula}</p>
          {m.coefs.length > 0 && (
            <ul className="space-y-1">
              {m.coefs.map((c) => (
                <li key={c.key}>
                  <code className="text-[11px]">{c.key}</code> = {typeof c.value === "object" ? Object.entries(c.value as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(", ") : String(c.value)} {c.unit}.{" "}
                  {c.note} {c.source_url && <a className="underline" href={c.source_url} target="_blank" rel="noreferrer">Source</a>}{!c.verified && " (not yet verified)"}
                </li>
              ))}
            </ul>
          )}
          {plain ? <p className="rounded-lg bg-secondary/60 p-2">{plain}</p> : (
            <button type="button" className="underline inline-flex items-center gap-1" onClick={explain} disabled={busy}>
              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Sparkles className="size-3" aria-hidden />} Explain in plain words
            </button>
          )}
        </div>
      </details>
    </li>
  );
}

export function EcoPanel({ gardenId, report, swaps, eco, changed, prevScore, canvas, dots, zones }: {
  gardenId: string; report: EcoReport; swaps: Swap[]; eco: EcoLayer; changed: { id: MetricId; before: number; now: number }[]; prevScore: number | null;
  canvas: { w: number; h: number }; dots: { x: number; y: number }[]; zones: [number, number][][];
}) {
  const router = useRouter();
  const [applying, setApplying] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function apply(s: Swap) {
    setApplying(s.id);
    setErr(null);
    try {
      const r = await fetch(`/api/gardens/${gardenId}/eco/swap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setApplying(null);
    }
  }

  const rise = prevScore != null && report.score !== prevScore ? report.score - Number(prevScore) : 0;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 flex flex-wrap items-center gap-5" aria-labelledby="score-h">
        <GradeBadge grade={report.grade} score={report.score} />
        <div className="space-y-1 flex-1 min-w-60">
          <h2 id="score-h" className="text-xl font-semibold">Eco score {report.grade} <span className="text-muted-foreground font-normal">· {report.score} / 100</span></h2>
          {rise !== 0 && <p className="text-sm font-medium text-primary">{rise > 0 ? `Up ${rise} points` : `Down ${-rise} points`} since your last visit</p>}
          <p className="text-sm text-muted-foreground">
            Weighted from water, rain capture, runoff, Bay-Safe, carbon, shade and pollinators.
            {!report.has_house && !report.balcony && " Add your house and roof to include rain capture, runoff and shade."}
            {report.balcony && " Balconies skip house, lawn and rain garden; water, food, pollinators and carbon still count."}
          </p>
        </div>
        {!report.balcony && (
          <Button variant={report.has_house ? "outline" : "default"} onClick={() => setEditing(!editing)}>
            <Home aria-hidden /> {report.has_house ? "Edit house and yard" : "Add your house and roof"}
          </Button>
        )}
      </section>

      {editing && !report.balcony && (
        <HouseLayer gardenId={gardenId} eco={eco} canvas={canvas} dots={dots} zones={zones} onDone={() => { setEditing(false); router.refresh(); }} />
      )}

      <section aria-labelledby="swaps-h" className="space-y-3">
        <h2 id="swaps-h" className="text-xl font-semibold">Greener swaps</h2>
        {swaps.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-2xl border bg-card p-4">Nothing to swap right now. Your garden is already doing well for its size.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {swaps.map((s) => (
              <li key={s.id} className="rounded-2xl border-2 border-primary/30 bg-secondary/40 p-4 flex flex-col gap-2">
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground flex-1">{s.detail}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-primary">+{s.delta} points</span>
                  <Button size="sm" onClick={() => apply(s)} disabled={!!applying}>{applying === s.id && <Loader2 className="animate-spin" aria-hidden />} Apply</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {err && <ErrorState message={err} />}
        <p className="text-xs text-muted-foreground">Swaps never suggest invasive plants and keep your style, sun and zone.</p>
      </section>

      <section aria-labelledby="tiles-h" className="space-y-3">
        <h2 id="tiles-h" className="text-xl font-semibold">The numbers</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.metrics.map((m) => <Tile key={m.id} m={m} gardenId={gardenId} change={changed.find((c) => c.id === m.id)} onAddHouse={() => setEditing(true)} />)}
        </ul>
      </section>
    </div>
  );
}
