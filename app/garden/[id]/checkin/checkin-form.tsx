"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, CheckCircle2, ImageUp, Info, Loader2, MapPin, Stethoscope, Upload } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { label as nice } from "@/lib/format";
import type { Diagnosis } from "@/lib/types";

const DEMOS = [
  { id: "spotted_firebush", title: "Firebush, spotted leaves" },
  { id: "healthy_firebush", title: "Firebush, healthy" },
  { id: "mexican_petunia", title: "Mexican petunia" },
];

interface Result {
  checkin_id: string;
  image_url: string | null;
  identify: { results: { score: number; species: { scientificNameWithoutAuthor: string; commonNames: string[] } }[] };
  identify_source: string;
  matched: { id: string; common_name: string; scientific_name: string; origin: string; invasive_status: string; score: number | null; from: string } | null;
  diagnosis: Diagnosis;
  diagnosis_source: string;
  swap: { message: string; alternatives: { id: string; common_name: string; hex: string }[] } | null;
  report: { id: string; label: string } | null;
  shared_skipped: string | null;
}

const HEALTH: Record<Diagnosis["overall_health"], { text: string; cls: string }> = {
  healthy: { text: "Healthy", cls: "bg-primary text-primary-foreground" },
  mild_stress: { text: "Mild stress", cls: "bg-[oklch(0.94_0.07_85)] text-[oklch(0.4_0.09_60)]" },
  moderate_problem: { text: "Moderate problem", cls: "bg-coral/20 text-[oklch(0.45_0.15_30)]" },
  severe_problem: { text: "Severe problem", cls: "bg-coral text-white" },
  unclear: { text: "Unclear from this photo", cls: "bg-muted text-foreground" },
};

export function CheckinForm({ gardenId, plants, autoDemo }: { gardenId: string; plants: { id: string; name: string }[]; autoDemo: string | null }) {
  const [demo, setDemo] = useState<string | null>(autoDemo && DEMOS.some((d) => d.id === autoDemo) ? autoDemo : "spotted_firebush");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [plantId, setPlantId] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError("Photo is larger than 5 MB. Try a smaller one."); return; }
    setError(null);
    setFile(f);
    setDemo(null);
    setPreview(URL.createObjectURL(f));
  };

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("garden_id", gardenId);
    if (file) fd.set("image", file);
    else if (demo) fd.set("demo_photo", demo);
    if (plantId) fd.set("plant_id", plantId);
    fd.set("share", String(share));
    try {
      const res = await fetch("/api/checkins", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Check-in failed");
      setResult(j);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // /garden/<id>/checkin?demo=spotted_firebush runs straight away (presenter shortcut).
  useEffect(() => {
    if (autoDemo && !autoRan.current) { autoRan.current = true; submit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  const shown = preview ?? (demo ? `/demo-photos/${demo}.jpg` : null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr] items-start">
      <section className="rounded-2xl border bg-card p-4 space-y-4" aria-label="Photo">
        <div className="aspect-[4/3] rounded-xl overflow-hidden border bg-muted grid place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown} alt={file ? "Your photo" : `Demo photo: ${DEMOS.find((d) => d.id === demo)?.title}`} className="size-full object-cover" />
            : <Camera className="size-10 text-muted-foreground" aria-hidden />}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Demo photos</p>
          <div className="grid grid-cols-3 gap-2">
            {DEMOS.map((d) => (
              <button key={d.id} onClick={() => { setDemo(d.id); setFile(null); setPreview(null); }} aria-pressed={demo === d.id && !file}
                className="rounded-xl border overflow-hidden text-left aria-pressed:ring-2 aria-pressed:ring-primary hover:border-primary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/demo-photos/${d.id}.jpg`} alt="" className="aspect-[4/3] object-cover w-full" />
                <span className="block text-[11px] leading-tight p-1.5">{d.title}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm cursor-pointer hover:bg-muted">
            <Upload className="size-4" aria-hidden /> {file ? file.name : "Or upload your own photo (max 5 MB)"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plant">Which plant is this? (optional)</Label>
          <select id="plant" value={plantId} onChange={(e) => setPlantId(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">Let the photo decide</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
          <Switch id="share" checked={share} onCheckedChange={setShare} />
          <Label htmlFor="share" className="text-sm font-normal leading-snug block">
            <span className="font-medium">Share anonymously</span> on the neighborhood disease map. Location rounded to about 1 km. Photo location data is removed.
          </Label>
        </div>
        <Button size="lg" className="w-full" onClick={submit} disabled={busy || (!file && !demo)}>
          {busy ? <><Loader2 className="animate-spin" aria-hidden /> Identifying and checking health…</> : <><Stethoscope aria-hidden /> Check this plant</>}
        </Button>
        {error && <ErrorState message={error} onRetry={submit} />}
      </section>

      <div ref={resultRef} aria-live="polite">
        {busy && <ResultSkeleton />}
        {!busy && !result && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
            <ImageUp className="size-8 mx-auto" aria-hidden />
            <p>Pick a demo photo or upload your own, then press <strong>Check this plant</strong>.</p>
          </div>
        )}
        {result && <ResultCard r={result} gardenId={gardenId} />}
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-5 space-y-3 animate-pulse" role="status" aria-label="Working">
      <div className="h-6 w-2/3 rounded bg-muted" /><div className="h-4 w-1/2 rounded bg-muted" />
      <div className="h-20 rounded bg-muted" /><div className="h-16 rounded bg-muted" />
    </div>
  );
}

function ResultCard({ r, gardenId }: { r: Result; gardenId: string }) {
  const d = r.diagnosis;
  const h = HEALTH[d.overall_health];
  return (
    <article className="rounded-2xl border bg-card p-5 space-y-5">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Matched plant</p>
        {r.matched ? (
          <div>
            <h2 className="text-2xl font-semibold">
              <Link href={`/plants/${r.matched.id}`} className="hover:underline">{r.matched.common_name}</Link>
            </h2>
            <p className="text-sm text-muted-foreground"><i>{r.matched.scientific_name}</i>
              {r.matched.score != null ? ` · ${Math.round(r.matched.score * 100)}% match` : " · picked by you"}</p>
          </div>
        ) : <h2 className="text-xl font-semibold">Not in our catalog</h2>}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 font-medium ${h.cls}`}>{h.text}</span>
          <span className="rounded-full px-3 py-1 bg-accent text-accent-foreground">Stage: {nice(d.phenology_stage)}</span>
        </div>
      </header>

      {r.swap && (
        <div className="rounded-xl border-2 border-coral bg-coral/5 p-4 space-y-2">
          <p className="font-semibold">{r.swap.message}</p>
          <div className="flex flex-wrap gap-2">
            {r.swap.alternatives.map((a) => (
              <Link key={a.id} href={`/plants/${a.id}`} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm hover:border-primary">
                <span className="size-3 rounded-full" style={{ background: a.hex }} aria-hidden />{a.common_name} <ArrowRight className="size-3" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      )}

      {d.candidates.length > 0 && (
        <section className="space-y-3" aria-label="Possible issues">
          <p className="text-sm font-medium">Possible issues</p>
          {d.candidates.map((c) => (
            <div key={c.issue_key} className="space-y-1">
              <div className="flex justify-between text-sm"><span className="font-medium">{c.label}</span><span className="tabular-nums">{Math.round(c.confidence * 100)}%</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden" role="meter" aria-valuenow={Math.round(c.confidence * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.label} confidence`}>
                <div className="h-full rounded-full bg-coral" style={{ width: `${c.confidence * 100}%`, opacity: 0.45 + c.confidence * 0.55 }} />
              </div>
              <p className="text-xs text-muted-foreground">{c.evidence}</p>
            </div>
          ))}
        </section>
      )}

      {d.actions.length > 0 && (
        <section className="space-y-2" aria-label="What to do">
          <p className="text-sm font-medium">What to do</p>
          <ul className="space-y-1.5">
            {d.actions.map((a) => <li key={a} className="flex gap-2 text-sm"><CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" aria-hidden />{a}</li>)}
          </ul>
        </section>
      )}

      <p className={`text-sm rounded-xl p-3 flex gap-2 ${d.see_expert ? "bg-coral/10" : "bg-secondary/60"}`}>
        <Info className="size-4 mt-0.5 shrink-0" aria-hidden />
        {d.see_expert
          ? "This looks serious enough to confirm. Bring a sample or photo to your local UF/IFAS Extension office."
          : "If it gets worse, confirm with your local UF/IFAS Extension office."}
      </p>

      {r.report && (
        <p className="text-sm flex items-center gap-2"><MapPin className="size-4 text-coral" aria-hidden />
          Shared anonymously: {r.report.label}. <Link href="/map" className="underline font-medium">See it on the map</Link>
        </p>
      )}
      {r.shared_skipped && <p className="text-xs text-muted-foreground">{r.shared_skipped}</p>}

      <footer className="flex flex-wrap gap-2 pt-1">
        <Button asChild><Link href="/map"><MapPin aria-hidden /> Nearby reports</Link></Button>
        <Button variant="outline" asChild><Link href={`/garden/${gardenId}`}>Back to dashboard</Link></Button>
      </footer>
      <p className="text-[11px] text-muted-foreground">
        ID by Pl@ntNet{r.identify_source === "fixture" ? " (saved demo response)" : ""}. Health check by Gemini{r.diagnosis_source === "fixture" ? " (saved demo response)" : ""}. AI can be wrong.
      </p>
    </article>
  );
}
