"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pause, Play, X } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { yearsBetween } from "@/lib/engine/geo";
import { heightAt, spreadAt } from "@/lib/engine/growth";
import { formatRange, monthName, predict } from "@/lib/engine/phenology";
import { useUI } from "@/lib/store";

import { PlantSvg } from "./plant-svg";
import { STAGE_LABEL, stageFor } from "./stage";

const todayIso = () => new Date().toISOString().slice(0, 10);

const PlantScene = dynamic(() => import("./plant-3d"), { ssr: false, loading: () => <div className="size-full grid place-items-center text-sm text-muted-foreground">Loading 3D…</div> });

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Any error inside the 3D scene falls back to the 2D drawing. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { console.warn("[inspector] 3D failed, using 2D", e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Side panel shown when any plant is clicked. One plant at a time. */
export function InspectorPanel() {
  const target = useUI((s) => s.inspect);
  const close = useUI((s) => s.closeInspector);
  if (!target) return null;
  return <Panel key={target.plant.id + (target.plantedOn ?? "")} onClose={close} />;
}

function Panel({ onClose }: { onClose: () => void }) {
  const t = useUI((s) => s.inspect)!;
  const p = t.plant;
  const today = t.today ?? todayIso();
  // Start at the plant's real age so the picture matches the "Predicted" dates below.
  const realAge = Math.min(10, Math.max(0, Math.round(yearsBetween(t.plantedOn ?? today, today) * 10) / 10));
  const [age, setAge] = useState(realAge);
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<"3d" | "2d">(() => (typeof window !== "undefined" && hasWebGL() ? "3d" : "2d"));
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Play grows the plant from its current age to year 3 (or 10 if already past 3) over ~3 s.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const from = age;
    const to = from < 3 ? 3 : 10;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 3000);
      setAge(Math.round((from + (to - from) * k) * 10) / 10);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const h = heightAt(p, age);
  const s = spreadAt(p, age);
  const stage = stageFor(p, month, age);
  const preds = useMemo(() => {
    const planted = t.plantedOn ?? today;
    return predict({ plant: p, today, plantedOn: planted });
  }, [p, t.plantedOn, today]);

  return (
    <aside role="dialog" aria-label={`${p.common_name} inspector`}
      className="fixed z-[1100] inset-y-0 right-0 w-full sm:w-[420px] bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      <header className="flex items-start justify-between p-4 border-b">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plant inspector</p>
          <h2 className="text-xl font-semibold">{p.common_name}</h2>
          <p className="text-sm italic text-muted-foreground">{p.scientific_name}</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="Close inspector"><X /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="relative aspect-[320/290] rounded-xl overflow-hidden border bg-accent/40">
          {mode === "3d" ? (
            <Fallback fallback={<PlantSvg plant={p} heightFt={h} spreadFt={s} stage={stage} />}>
              <PlantScene plant={p} heightFt={h} spreadFt={s} stage={stage} />
            </Fallback>
          ) : (
            <PlantSvg plant={p} heightFt={h} spreadFt={s} stage={stage} />
          )}
          <div role="group" aria-label="View" className="absolute top-2 right-2 flex rounded-lg border bg-card/90 text-xs overflow-hidden">
            {(["3d", "2d"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                className="px-2 py-1 uppercase aria-pressed:bg-primary aria-pressed:text-primary-foreground">{m}</button>
            ))}
          </div>
          {mode === "3d" && <p className="absolute bottom-1.5 left-2 text-[10px] text-muted-foreground">Drag to orbit · scroll to zoom</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Height" value={`${h.toFixed(1)} ft`} />
          <Stat label="Spread" value={`${s.toFixed(1)} ft`} />
          <Stat label={monthName(month)} value={STAGE_LABEL[stage]} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-baseline gap-2">
              <label className="text-sm font-medium" htmlFor="age">Age: {age.toFixed(1)} years</label>
              {age !== realAge && (
                <button type="button" onClick={() => { setPlaying(false); setAge(realAge); }} className="text-xs text-primary underline underline-offset-2">back to today</button>
              )}
            </span>
            <button onClick={() => setPlaying((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm hover:bg-muted">
              {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} {playing ? "Pause" : "Play"}
            </button>
          </div>
          <Slider id="age" min={0} max={10} step={0.1} value={[age]} onValueChange={([v]) => { setPlaying(false); setAge(v); }} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="month">Month: {monthName(month)}</label>
          <Slider id="month" min={1} max={12} step={1} value={[month]} onValueChange={([v]) => setMonth(v)} />
        </div>
        <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5 text-sm">
          <p className="font-medium">Predicted</p>
          {preds.length === 0 && <p className="text-muted-foreground">No showy bloom or fruit.</p>}
          {preds.map((x) => (
            <p key={x.event}>
              <span className="font-medium capitalize">{x.event}</span>: {x.now ? "now" : formatRange(x.earliest, x.latest, today)}
              <span className="block text-xs text-muted-foreground">{x.basis} · {x.confidence} confidence</span>
            </p>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
