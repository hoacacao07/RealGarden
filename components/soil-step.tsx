"use client";

/**
 * Wizard step "Your soil" (Phase 10). Looks up the USDA soil survey for the pin, lets the user edit it, asks about
 * fill dirt, explains three home tests, and takes optional UF/IFAS lab results (pH, organic matter).
 */
import { useEffect, useState } from "react";
import { FlaskConical, Loader2, Pencil, TestTube, Timer } from "lucide-react";

import { SoilFactsList, SoilSourceBadge } from "@/components/soil-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { soilTips } from "@/lib/engine/soil";
import type { Drainage, Region, Soil, SoilFacts } from "@/lib/types";

export interface SoilValue extends SoilFacts { soil: Soil; drainage: Drainage }

const SOILS: { v: Soil; l: string }[] = [{ v: "sand", l: "Sand" }, { v: "sandy_loam", l: "Sandy loam" }, { v: "loam", l: "Loam" }, { v: "muck", l: "Muck" }];
const DRAINS: { v: Drainage; l: string }[] = [{ v: "fast", l: "Dries fast" }, { v: "moderate", l: "Moderate" }, { v: "poor", l: "Puddles stay" }];

const HOW_TO = [
  { icon: <TestTube aria-hidden />, title: "Jar test (texture)", text: "Fill a jar 1/3 with soil, top up with water and a pinch of dish soap, shake, and let it settle for a day. Sand drops in a minute, silt in hours, clay floats for a day. Mostly sand on the bottom = sandy soil." },
  { icon: <Timer aria-hidden />, title: "Percolation test (drainage)", text: "Dig a hole 12 in deep, fill it with water, let it drain, then fill it again and time it. Under 1 hour per inch drains fast; over 4 hours per inch drains poorly." },
  { icon: <FlaskConical aria-hidden />, title: "pH kit", text: "A garden-center kit or meter gives a rough pH. For a reliable number, mail a sample to the UF/IFAS Extension Soil Testing Laboratory." },
];

const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

export function SoilStep({ lat, lon, region, value, onChange }: {
  lat: number | null; lon: number | null; region: Region | null; value: SoilValue; onChange: (v: SoilValue) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [urban, setUrban] = useState(() => /urban land/i.test(value.survey_name ?? ""));
  const [editing, setEditing] = useState(false);
  const [lab, setLab] = useState(false);
  const [labPh, setLabPh] = useState("");
  const [labOm, setLabOm] = useState("");
  const pointKey = lat != null && lon != null ? `${lat.toFixed(4)},${lon.toFixed(4)}` : null;
  // A site that already has soil data for this pin (editing a saved garden) keeps it instead of re-fetching.
  const [fetchedFor, setFetchedFor] = useState<string | null>(() => (value.survey_name || value.soil_source !== "unknown" ? pointKey : null));
  const loading = !!pointKey && pointKey !== fetchedFor;

  // Look up the survey once per pin. A garden that already has survey values for this point keeps them.
  useEffect(() => {
    if (!pointKey || pointKey === fetchedFor) return;
    let stop = false;
    fetch(`/api/soil?lat=${lat}&lon=${lon}`)
      .then((r) => r.json())
      .then((s) => {
        if (stop) return;
        setFetchedFor(pointKey);
        setErr(null);
        setUrban(!!s.urban);
        if (!s.found) { setErr("No soil survey data for this point. Use the home tests below and enter what you find."); return; }
        onChange({
          ...value, soil_source: s.soil_source, survey_name: s.survey_name, component: s.component, drainage_class: s.drainage_class,
          sand_pct: s.sand_pct, clay_pct: s.clay_pct, om_pct: s.om_pct, ph: s.ph, awc: s.awc, soil: s.soil, drainage: s.drainage,
        });
      })
      .catch(() => {
        if (stop) return;
        setFetchedFor(pointKey);
        setErr("Could not reach the soil survey. You can enter your soil by hand.");
      });
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch only when the pin changes
  }, [pointKey]);

  const set = (patch: Partial<SoilValue>) => onChange({ ...value, ...patch });
  const tips = region ? soilTips({ ...value, region, urban }) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border bg-secondary/40 p-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{value.survey_name ?? (loading ? "Looking up the soil survey…" : "Your soil")}</p>
            <div className="flex items-center gap-2">
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <SoilSourceBadge source={value.soil_source} />
              <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}><Pencil aria-hidden /> Edit</Button>
            </div>
          </div>
          {!pointKey && <p className="text-sm text-muted-foreground">Pick a location first and we look up the USDA soil survey for it.</p>}
          {err && <p className="text-sm text-muted-foreground" role="status">{err}</p>}
          <SoilFactsList facts={value} soil={value.soil} drainage={value.drainage} />
          {value.soil_source === "unknown" && value.survey_name && (
            <p className="text-xs text-muted-foreground">This map unit includes built-up “Urban land”, so the survey values are hints only. A jar test and pH kit tell you more.</p>
          )}
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-card p-3">
              <div className="space-y-1">
                <Label htmlFor="soil-type">Texture</Label>
                <select id="soil-type" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.soil}
                  onChange={(e) => set({ soil: e.target.value as Soil, soil_source: "user" })}>
                  {SOILS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="soil-drain">Drainage after heavy rain</Label>
                <select id="soil-drain" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.drainage}
                  onChange={(e) => set({ drainage: e.target.value as Drainage, drainage_class: null, soil_source: "user" })}>
                  {DRAINS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="soil-ph">pH</Label>
                <Input id="soil-ph" type="number" step="0.1" min={3} max={10} className="h-9" value={value.ph ?? ""}
                  onChange={(e) => set({ ph: numOrNull(e.target.value), soil_source: "user" })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="soil-om">Organic matter (%)</Label>
                <Input id="soil-om" type="number" step="0.1" min={0} max={100} className="h-9" value={value.om_pct ?? ""}
                  onChange={(e) => set({ om_pct: numOrNull(e.target.value), soil_source: "user" })} />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Was this yard built on fill dirt? (new construction)</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Built on fill dirt">
              {([[true, "Yes"], [false, "No"], [null, "Not sure"]] as const).map(([v, l]) => (
                <button key={l} type="button" role="radio" aria-checked={(value.is_fill ?? null) === v} onClick={() => set({ is_fill: v })}
                  className="px-3.5 py-2 rounded-xl border bg-card text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground hover:border-primary/60">
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
          {tips.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {tips.map((t) => <li key={t.key} className="rounded-lg bg-accent/60 px-3 py-2">{t.text}</li>)}
            </ul>
          )}
          <div className="rounded-xl border p-3 space-y-2">
            <button className="text-sm font-medium underline" onClick={() => setLab((v) => !v)} aria-expanded={lab}>I have UF/IFAS soil lab results</button>
            {lab && (
              <form className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end" onSubmit={(e) => {
                e.preventDefault();
                const ph = numOrNull(labPh);
                const om = numOrNull(labOm);
                if (ph == null && om == null) return;
                set({ ph: ph ?? value.ph ?? null, om_pct: om ?? value.om_pct ?? null, soil_source: "lab" });
              }}>
                <div className="space-y-1"><Label htmlFor="lab-ph">Lab pH</Label><Input id="lab-ph" type="number" step="0.1" min={3} max={10} className="h-9" value={labPh} onChange={(e) => setLabPh(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="lab-om">Organic matter %</Label><Input id="lab-om" type="number" step="0.1" min={0} max={100} className="h-9" value={labOm} onChange={(e) => setLabOm(e.target.value)} /></div>
                <Button type="submit" size="sm">Use</Button>
              </form>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {HOW_TO.map((h) => (
          <div key={h.title} className="rounded-xl border bg-card p-3 space-y-1">
            <p className="font-medium text-sm flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-primary">{h.icon}{h.title}</p>
            <p className="text-xs text-muted-foreground">{h.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
