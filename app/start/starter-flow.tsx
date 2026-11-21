"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bug, Carrot, Clock, Flower2, Loader2, Sprout, Sun } from "lucide-react";

import { SunStrip } from "@/components/balcony/sun-strip";

import { ErrorState } from "@/components/states";
import { PlantIcon } from "@/components/plant-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { windowText } from "@/lib/engine/edibles";
import { balconyStarter } from "@/lib/engine/balcony";
import { sunStrip, sunSummary, typicalPotD } from "@/lib/engine/balconySun";
import { CONTAINER_SPACES, soilPlan } from "@/lib/engine/soilplan";
import { starterPlan } from "@/lib/engine/starter";
import type { Goal, HoursWeek, Plant, SiteInput, Space, StarterAnswers } from "@/lib/types";

import { SiteWizard, type WizardResult } from "../design/site-wizard";

const GOALS: { id: Goal; title: string; blurb: string; icon: React.ReactNode }[] = [
  { id: "flowers", title: "Flowers", blurb: "Color most of the year", icon: <Flower2 aria-hidden /> },
  { id: "food", title: "Food", blurb: "Tomatoes, peppers, herbs", icon: <Carrot aria-hidden /> },
  { id: "butterflies", title: "Butterflies", blurb: "Nectar and host plants", icon: <Bug aria-hidden /> },
  { id: "low_care", title: "Low-care", blurb: "Little watering once established", icon: <Clock aria-hidden /> },
];
const HOURS: { v: HoursWeek; l: string }[] = [{ v: "1", l: "About 1 hour" }, { v: "2-4", l: "2 to 4 hours" }, { v: "5+", l: "5+ hours" }];
const SPACES: { v: Space; l: string; blurb: string }[] = [
  { v: "yard", l: "Yard", blurb: "Beds in the ground" },
  { v: "raised_bed", l: "Raised bed", blurb: "A bed you build and fill" },
  { v: "containers", l: "Containers", blurb: "Pots on a porch or steps" },
  { v: "patio", l: "Patio", blurb: "A paved patio, pots only" },
  { v: "balcony", l: "Balcony", blurb: "Little or no yard" },
];

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function Choice({ checked, onClick, children, multi = false }: { checked: boolean; onClick: () => void; children: React.ReactNode; multi?: boolean }) {
  return (
    <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={checked} onClick={onClick}
      className="text-left rounded-2xl border-2 bg-card p-4 flex gap-3 items-start aria-checked:border-primary aria-checked:bg-secondary hover:border-primary/50">
      {children}
    </button>
  );
}

export function StarterFlow({ plants }: { plants: Plant[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [a, setA] = useState<StarterAnswers>({ goals: ["butterflies"], hours_week: "2-4", budget_usd: null, space: "yard", target_harvest: null });
  const [site, setSite] = useState<WizardResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byId = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);

  // Balcony mode (Phase 11.5) for balcony, patio or containers: balcony profile instead of soil, pots instead of beds.
  const balcony = !!a.space && CONTAINER_SPACES.includes(a.space);
  const plan = useMemo(() => {
    if (!site) return null;
    return site.site.kind === "balcony" ? balconyStarter(a, site.site, plants, today()) : starterPlan(a, site.site, plants, today());
  }, [a, site, plants]);
  const soil = useMemo(
    () => (site && plan ? soilPlan(site.site, [...new Set(plan.zones.map((z) => z.kind ?? "landscape"))], a.space) : []),
    [site, plan, a.space],
  );

  const toggleGoal = (g: Goal) => setA((x) => ({ ...x, goals: x.goals.includes(g) ? x.goals.filter((y) => y !== g) : [...x.goals, g] }));

  async function create() {
    if (!site || !plan) return;
    setSaving(true);
    setErr(null);
    const t = today();
    const body = {
      name: plan.name, theme: plan.theme, canvas_w_ft: plan.canvas_w_ft, canvas_h_ft: plan.canvas_h_ft, planted_on: t,
      site: { ...site.site, name: site.place ? `${site.place} garden` : site.site.name } satisfies SiteInput, starter: a, zones: plan.zones,
      placements: plan.placements.map((p) => ({ ...p, planted_on: p.planted_on ?? t })),
    };
    try {
      const res = await fetch("/api/gardens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the garden");
      router.push(`/design?garden=${data.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  const sunInfo = useMemo(() => {
    if (site?.site.kind !== "balcony") return null;
    const strip = sunStrip(site.site.lat, site.site.lon, site.site, typicalPotD(site.site));
    return { strip, summary: sunSummary(site.site.facing_deg ?? 180, strip) };
  }, [site]);
  const count = (ids: string[]) => ids.map((id) => ({ p: byId.get(id)!, n: plan!.placements.filter((x) => x.plant_id === id).length })).filter((x) => x.p);
  const nativeIds = plan ? [...new Set(plan.placements.filter((p) => byId.get(p.plant_id)?.origin === "native" && !plan.pollinators.includes(p.plant_id)).map((p) => p.plant_id))] : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-primary">Garden Starter · step {step} of 4</p>
        <h1 className="text-3xl font-semibold">
          {step === 1 ? "What do you want from your garden?" : step === 2 ? "Time, budget and space" : step === 3 ? "Where is it?" : "Your plan"}
        </h1>
      </header>

      {step === 1 && (
        <section className="space-y-4">
          <p className="text-muted-foreground">Pick all that apply.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GOALS.map((g) => (
              <Choice key={g.id} multi checked={a.goals.includes(g.id)} onClick={() => toggleGoal(g.id)}>
                <span className="rounded-xl bg-secondary p-2 text-primary">{g.icon}</span>
                <span><span className="block font-semibold">{g.title}</span><span className="text-sm text-muted-foreground">{g.blurb}</span></span>
              </Choice>
            ))}
          </div>
          <div className="flex justify-end"><Button size="lg" disabled={!a.goals.length} onClick={() => setStep(2)}>Next <ArrowRight aria-hidden /></Button></div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="font-medium">Hours per week you can spend</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Hours per week">
              {HOURS.map((h) => (
                <button key={h.v} type="button" role="radio" aria-checked={a.hours_week === h.v} onClick={() => setA({ ...a, hours_week: h.v })}
                  className="px-3.5 py-2 rounded-xl border bg-card text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground">{h.l}</button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="budget">Budget in dollars (optional)</Label>
            <Input id="budget" type="number" min={0} inputMode="numeric" value={a.budget_usd ?? ""} className="h-10"
              onChange={(e) => setA({ ...a, budget_usd: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
            <p className="text-xs text-muted-foreground">Kept with your plan. We never guess store prices; you can add your own on the shopping list.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="font-medium">Space</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Space">
              {SPACES.map((s) => (
                <Choice key={s.v} checked={a.space === s.v} onClick={() => setA({ ...a, space: s.v })}>
                  <PlantIcon category={s.v === "yard" ? "shrub" : s.v === "raised_bed" ? "vegetable" : "herb"} className="size-9" />
                  <span><span className="block font-semibold">{s.l}</span><span className="text-sm text-muted-foreground">{s.blurb}</span></span>
                </Choice>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft aria-hidden /> Back</Button>
            <Button size="lg" onClick={() => setStep(3)}>Next <ArrowRight aria-hidden /></Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft aria-hidden /> Back</Button>
          <SiteWizard hideTheme submitLabel="See my plan" mode={balcony ? "balcony" : "yard"} key={balcony ? "balcony" : "yard"}
            initial={site && (site.site.kind === "balcony") === balcony ? site : { name: balcony ? "My balcony garden" : a.goals.includes("food") ? "My native and food garden" : "My native garden" }}
            onDone={(r) => { setSite(r); setStep(4); }} />
        </section>
      )}

      {step === 4 && plan && site && (
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {site.site.kind === "balcony" ? (
              <div className="rounded-2xl border bg-card p-5 space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Sun className="size-5 text-[oklch(0.7_0.15_80)]" aria-hidden /> Your balcony</h2>
                {sunInfo && <SunStrip hours={sunInfo.strip} summary={sunInfo.summary} />}
                <p className="text-sm"><strong>Pollinator pots:</strong> {count(plan.pollinators).map(({ p, n }) => `${n}× ${p.common_name}`).join(", ") || "none"}.
                  {" "}{plan.pollinators[0] && plan.crops.length > 0 && <>A pot of {byId.get(plan.pollinators[0])!.common_name.toLowerCase()} next to the {byId.get(plan.crops[0])!.common_name.toLowerCase()} brings pollinators.</>}</p>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card p-5 space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Sprout className="size-5 text-primary" aria-hidden /> Landscape zone: natives</h2>
                <ul className="text-sm space-y-1">
                  {count(nativeIds).map(({ p, n }) => <li key={p.id}><strong>{n}×</strong> {p.common_name}</li>)}
                </ul>
                <p className="text-xs text-muted-foreground">Ranked for your sun, soil and distance to the coast{plan.theme ? ", with a butterfly and wildlife theme" : ""}.</p>
              </div>
            )}
            {plan.crops.length > 0 ? (
              <div className="rounded-2xl border border-[oklch(0.8_0.08_60)] bg-[oklch(0.98_0.02_70)] p-5 space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Carrot className="size-5 text-[oklch(0.55_0.15_45)]" aria-hidden /> {site.site.kind === "balcony" ? "Edible pots" : "Edible zone"}</h2>
                <ul className="text-sm space-y-1">
                  {count(plan.crops).map(({ p, n }) => (
                    <li key={p.id}><strong>{n}×</strong> {p.common_name} <span className="text-muted-foreground">· plant {windowText(p.edible!.planting_windows[site.site.region])}</span></li>
                  ))}
                </ul>
                {plan.pollinators.length > 0 && site.site.kind !== "balcony" && (
                  <p className="text-sm">Next to the bed for pollinators: {count(plan.pollinators).map(({ p }) => p.common_name).join(", ")}.</p>
                )}
              </div>
            ) : a.goals.includes("food") ? (
              <div className="rounded-2xl border bg-card p-5 text-sm">No crops fit a planting window in the next few months here. Add some later from the Edibles list.</div>
            ) : null}
          </div>
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <h2 className="text-lg font-semibold">Soil plan</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {soil.map((s) => (
                <li key={s.zone_kind} className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.zone_kind === "edible" ? "Edible zone" : "Native zone"}</p>
                  <p className="font-semibold">{s.title}</p>
                  <ul className="text-sm list-disc pl-5">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </li>
              ))}
            </ul>
          </div>
          {err && <ErrorState message={err} />}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(3)}><ArrowLeft aria-hidden /> Back</Button>
            <Button size="lg" className="h-11 px-6 text-base" onClick={create} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : null} Open in the Design studio <ArrowRight aria-hidden />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Your garden gets its own link. You can move, add or remove anything in the studio, then see the shopping list and calendar.</p>
        </section>
      )}
    </div>
  );
}
