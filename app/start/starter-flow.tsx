"use client";

/**
 * Garden Starter, simple by default (spec 2B, Phases 11.6 and 11.8). Only two questions are needed:
 *   1. Style: pick one or more themes by picture.
 *   2. Place: ZIP, yard or balcony, size, sun ("Not sure" is fine).
 *   3. Your garden: plants suggested for the ZIP's zone, sun and soil, each with "Why this plant" and a
 *      "Plant now / Plant in March" badge; "Prefer native plants" re-ranks the list.
 * Soil comes from the USDA survey automatically (safe defaults when missing). Everything else is optional.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, Home, Leaf, Loader2, MapPin, Plus, Sparkles, X } from "lucide-react";

import { BalconyStep, DEFAULT_BALCONY, type BalconyValue } from "@/components/balcony/balcony-step";
import { ErrorState } from "@/components/states";
import { PlantIcon } from "@/components/plant-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { planFromPicks } from "@/lib/engine/pickLayout";
import type { ThemeDef } from "@/lib/engine/suggest";
import type { Goal, HoursWeek, Light, Plant, PreferNatives, SiteInput } from "@/lib/types";

import { balconySite } from "../design/site-wizard";

type Kind = "yard" | "balcony";
type SunChoice = Light | "not_sure";
interface ZoneRes { zip: string; zone: string; label: string; lat: number; lon: number; place: string | null; region: SiteInput["region"]; coast_mi: number | null; source: string }
interface Pick {
  id: string; name: string; category: string; group: string; native: boolean; score: number; theme: string | null; reasons: string[];
  when: { now: boolean; label: string }; colors: { name: string; hex: string }[]; fl_notes: string | null; spread_ft: [number, number]; edible: boolean;
  qty: number; reason: string;
}
interface SuggestRes { zone: string; source: "gemini" | "rules"; picks: Pick[]; candidates: Omit<Pick, "qty" | "reason">[] }

const SIZES = [{ v: 150, l: "Small", d: "A strip or corner, about 10 × 15 ft" }, { v: 400, l: "Medium", d: "About 20 × 20 ft" }, { v: 1000, l: "Large", d: "Most of a backyard" }];
const SUN: { v: SunChoice; l: string; d: string }[] = [
  { v: "full_sun", l: "Full sun", d: "6+ hours of direct sun" }, { v: "partial_shade", l: "Some shade", d: "Sun half the day" },
  { v: "full_shade", l: "Mostly shade", d: "Under trees or north side" }, { v: "not_sure", l: "Not sure", d: "We'll assume some shade" },
];
const PREF: { v: PreferNatives; l: string }[] = [{ v: "off", l: "No preference" }, { v: "some", l: "Some natives" }, { v: "mostly", l: "Mostly natives" }];
const HOURS: { v: HoursWeek; l: string }[] = [{ v: "1", l: "About 1 hour a week" }, { v: "2-4", l: "2 to 4 hours" }, { v: "5+", l: "5+ hours" }];

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Goals implied by the styles, for the scoring and the calendar. */
function goalsFor(themes: string[]): Goal[] {
  const g = new Set<Goal>();
  for (const t of themes) {
    if (["butterfly"].includes(t)) g.add("butterflies");
    if (["salad", "herb", "fruit", "salsa_pizza", "kids"].includes(t)) g.add("food");
    if (["rose_flower", "tropical", "shade", "butterfly"].includes(t)) g.add("flowers");
    if (t === "low_maintenance") g.add("low_care");
  }
  return [...g];
}

function Card({ checked, onClick, children, role = "checkbox" }: { checked: boolean; onClick: () => void; children: React.ReactNode; role?: "checkbox" | "radio" }) {
  return (
    <button type="button" role={role} aria-checked={checked} onClick={onClick}
      className="relative text-left rounded-2xl border-2 bg-card p-4 aria-checked:border-primary aria-checked:bg-secondary hover:border-primary/50 transition-colors">
      {checked && <Check className="absolute top-3 right-3 size-5 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

function ThemeArt({ t }: { t: ThemeDef }) {
  return (
    <div className="h-20 rounded-xl mb-3 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${t.colors[0]}33, ${t.colors[2] ?? t.colors[0]}55)` }} aria-hidden>
      {t.colors.map((c, i) => <span key={i} className="absolute rounded-full" style={{ background: c, width: 34 - i * 6, height: 34 - i * 6, left: `${18 + i * 22}%`, top: `${30 + (i % 2) * 22}%`, opacity: 0.85 }} />)}
      <span className="absolute right-3 bottom-2 text-3xl">{t.emoji}</span>
    </div>
  );
}

export function StarterFlow({ themes, plants }: { themes: ThemeDef[]; plants: Plant[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<string[]>(["butterfly"]);
  const [zip, setZip] = useState("");
  const [zone, setZone] = useState<ZoneRes | null>(null);
  const [zoneErr, setZoneErr] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("yard");
  const [area, setArea] = useState(400);
  const [sun, setSun] = useState<SunChoice>("full_sun");
  const [bal, setBal] = useState<BalconyValue>({ ...DEFAULT_BALCONY, facing_deg: 270, floor_level: 4 });
  const [more, setMore] = useState(false);
  const [pref, setPref] = useState<PreferNatives>("off");
  const [hours, setHours] = useState<HoursWeek | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [soil, setSoil] = useState<Partial<SiteInput> | null>(null);
  const [res, setRes] = useState<SuggestRes | null>(null);
  const [mine, setMine] = useState<Pick[]>([]);
  const [busy, setBusy] = useState<"zone" | "suggest" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const toggle = (id: string) => {
    const on = !picked.includes(id);
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
    if (on && id === "balcony") setKind("balcony");
  };

  async function findZip(z = zip) {
    setBusy("zone");
    setZoneErr(null);
    try {
      const r = await fetch(`/api/zone?zip=${z}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setZone(j);
      // Soil from the USDA survey in the background; sandy, fast-draining defaults if it fails.
      fetch(`/api/soil?lat=${j.lat}&lon=${j.lon}`).then((s) => s.json()).then(setSoil).catch(() => setSoil(null));
    } catch (e) {
      setZone(null);
      setZoneErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const site = useMemo<SiteInput | null>(() => {
    if (!zone) return null;
    const rest = { coastal_distance_mi: zone.coast_mi ?? 3, native_target_pct: pref === "mostly" ? 75 : pref === "some" ? 50 : null, name: zone.place ? `${zone.place} garden` : "My garden", zip: zone.zip };
    if (kind === "balcony") return balconySite(bal, zone.lat, zone.lon, rest);
    const s = soil ?? {};
    return {
      ...rest, kind: "yard", lat: zone.lat, lon: zone.lon, region: zone.region, sun: sun === "not_sure" ? "partial_shade" : sun,
      soil: (s.soil as SiteInput["soil"]) ?? "sand", drainage: (s.drainage as SiteInput["drainage"]) ?? "fast", area_sqft: area,
      soil_source: s.soil_source ?? "unknown", survey_name: s.survey_name ?? null, component: s.component ?? null, drainage_class: s.drainage_class ?? null,
      sand_pct: s.sand_pct ?? null, clay_pct: s.clay_pct ?? null, om_pct: s.om_pct ?? null, ph: s.ph ?? null, awc: s.awc ?? null, is_fill: null,
    };
  }, [zone, kind, bal, soil, sun, area, pref]);

  async function getSuggestions(p = pref) {
    if (!site || !zone) return;
    setBusy("suggest");
    setErr(null);
    try {
      const r = await fetch("/api/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, zone: zone.zone, themes: picked, goals: goalsFor(picked), prefer_natives: p, hours_week: hours }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRes(j);
      setMine(j.picks);
      setStep(3);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!site || !zone) return;
    setBusy("save");
    setErr(null);
    const t = today();
    const names = picked.map((id) => themes.find((x) => x.id === id)?.name.split(" ")[0]).filter(Boolean);
    const plan = planFromPicks(mine.map((m) => ({ plant_id: m.id, qty: m.qty, reason: m.reason })), plants, site, t,
      { name: kind === "balcony" ? "My balcony garden" : `My ${names.slice(0, 2).join(" & ").toLowerCase() || "new"} garden`, theme: picked.includes("butterfly") ? "wildlife" : null });
    const body = {
      name: plan.name, theme: plan.theme, canvas_w_ft: plan.canvas_w_ft, canvas_h_ft: plan.canvas_h_ft, planted_on: t, site,
      starter: {
        goals: goalsFor(picked), hours_week: hours, budget_usd: budget, space: kind === "balcony" ? "balcony" : plan.zones.some((z) => z.bed === "raised") ? "raised_bed" : "yard",
        target_harvest: null, themes: picked, prefer_natives: pref, hardiness_zone: zone.zone,
      },
      zones: plan.zones, placements: plan.placements.map((p) => ({ ...p, planted_on: p.planted_on ?? t })),
    };
    try {
      const r = await fetch("/api/gardens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not create the garden");
      router.push(`/design?garden=${j.id}&tab=colors`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  const extra = res?.candidates.filter((c) => !mine.some((m) => m.id === c.id)) ?? [];
  const add = (c: SuggestRes["candidates"][number]) => setMine((m) => [...m, { ...c, qty: 1, reason: c.reasons[0] ?? "Fits your garden" }]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-primary">Step {step} of 3</p>
        <h1 className="text-3xl font-semibold">{step === 1 ? "Pick your style" : step === 2 ? "Where's your garden?" : "Your garden"}</h1>
        {step === 1 && <p className="text-muted-foreground">Choose one or mix a few. You can change everything later.</p>}
      </header>

      {step === 1 && (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {themes.map((t) => (
              <Card key={t.id} checked={picked.includes(t.id)} onClick={() => toggle(t.id)}>
                <ThemeArt t={t} />
                <span className="block font-semibold">{t.name}</span>
                <span className="text-sm text-muted-foreground">{t.description}</span>
              </Card>
            ))}
          </div>
          <div className="flex justify-end"><Button size="lg" disabled={!picked.length} onClick={() => setStep(2)}>Next <ArrowRight aria-hidden /></Button></div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-6">
          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <form className="space-y-2 max-w-sm" onSubmit={(e) => { e.preventDefault(); findZip(); }}>
              <Label htmlFor="zip">ZIP code</Label>
              <div className="flex gap-2">
                <Input id="zip" inputMode="numeric" maxLength={5} placeholder="33620" className="h-11 text-lg" value={zip}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setZip(v); if (v.length === 5) findZip(v); }} />
                <Button type="submit" size="lg" disabled={zip.length !== 5 || busy === "zone"}>{busy === "zone" ? <Loader2 className="animate-spin" aria-hidden /> : <MapPin aria-hidden />} Find</Button>
              </div>
            </form>
            {zoneErr && <p className="text-sm text-coral" role="alert">{zoneErr}</p>}
            {zone && (
              <p className="text-sm flex flex-wrap items-center gap-2" role="status">
                <span className="font-medium">{zone.place ?? `ZIP ${zone.zip}`}</span>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">USDA {zone.label}</span>
                <span className="text-muted-foreground">{zone.region} Florida{zone.source === "estimate" ? " · zone estimated from latitude" : ""}</span>
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="font-medium">What kind of space?</legend>
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl" role="radiogroup">
              <Card role="radio" checked={kind === "yard"} onClick={() => setKind("yard")}><Home className="size-6 text-primary mb-1" aria-hidden /><span className="block font-semibold">Yard</span><span className="text-sm text-muted-foreground">Beds in the ground or a raised bed</span></Card>
              <Card role="radio" checked={kind === "balcony"} onClick={() => setKind("balcony")}><Building2 className="size-6 text-primary mb-1" aria-hidden /><span className="block font-semibold">Balcony or patio</span><span className="text-sm text-muted-foreground">Pots only, little or no yard</span></Card>
            </div>
          </fieldset>

          {kind === "yard" ? (
            <>
              <fieldset className="space-y-2">
                <legend className="font-medium">How big?</legend>
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
                  {SIZES.map((s) => <Card role="radio" key={s.v} checked={area === s.v} onClick={() => setArea(s.v)}><span className="block font-semibold">{s.l}</span><span className="text-sm text-muted-foreground">{s.d}</span></Card>)}
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="font-medium">How much sun?</legend>
                <div className="grid gap-3 sm:grid-cols-4" role="radiogroup">
                  {SUN.map((s) => <Card role="radio" key={s.v} checked={sun === s.v} onClick={() => setSun(s.v)}><span className="block font-semibold">{s.l}</span><span className="text-sm text-muted-foreground">{s.d}</span></Card>)}
                </div>
              </fieldset>
            </>
          ) : (
            <div className="rounded-2xl border bg-card p-5"><BalconyStep lat={zone?.lat ?? null} lon={zone?.lon ?? null} value={bal} onChange={setBal} /></div>
          )}

          <div className="rounded-2xl border bg-card">
            <button type="button" className="w-full flex items-center justify-between p-4 font-medium" aria-expanded={more} onClick={() => setMore(!more)}>
              More options (optional) <ChevronDown className={`size-5 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {more && (
              <div className="px-4 pb-4 grid gap-5 md:grid-cols-3">
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium flex items-center gap-1"><Leaf className="size-4 text-primary" aria-hidden /> Prefer native plants</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">
                    {PREF.map((o) => <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} onClick={() => setPref(o.v)} className="px-3 py-1.5 rounded-xl border text-sm aria-checked:bg-primary aria-checked:text-primary-foreground">{o.l}</button>)}
                  </div>
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Time you have</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">
                    {HOURS.map((o) => <button key={o.v} type="button" role="radio" aria-checked={hours === o.v} onClick={() => setHours(hours === o.v ? null : o.v)} className="px-3 py-1.5 rounded-xl border text-sm aria-checked:bg-primary aria-checked:text-primary-foreground">{o.l}</button>)}
                  </div>
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget in dollars</Label>
                  <Input id="budget" type="number" min={0} inputMode="numeric" value={budget ?? ""} onChange={(e) => setBudget(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
                </div>
              </div>
            )}
          </div>

          {err && <ErrorState message={err} onRetry={() => getSuggestions()} />}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft aria-hidden /> Back</Button>
            <Button size="lg" disabled={!site || busy === "suggest"} onClick={() => getSuggestions()}>
              {busy === "suggest" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Show my garden
            </Button>
          </div>
        </section>
      )}

      {step === 3 && res && zone && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">USDA Zone {res.zone}</span>
              Picked for {zone.place ?? zone.zip}, your sun and soil{res.source === "gemini" ? ", balanced by Garden AI" : ""}.
            </p>
            <div className="flex items-center gap-2 text-sm" role="radiogroup" aria-label="Prefer native plants">
              <Leaf className="size-4 text-primary" aria-hidden /> Prefer native plants:
              {PREF.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} disabled={busy === "suggest"}
                  onClick={() => { setPref(o.v); getSuggestions(o.v); }}
                  className="px-2.5 py-1 rounded-lg border aria-checked:bg-primary aria-checked:text-primary-foreground">{o.l}</button>
              ))}
              {busy === "suggest" && <Loader2 className="size-4 animate-spin" aria-label="Updating" />}
            </div>
          </div>

          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">No plants yet. Add some from the list below.</div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((p) => (
                <li key={p.id} className="rounded-2xl border bg-card p-4 flex gap-3">
                  <div className="shrink-0 rounded-xl bg-secondary/70 p-2 h-fit"><PlantIcon category={p.category} className="size-12" /></div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-tight">{p.qty > 1 ? `${p.qty} × ` : ""}{p.name}</p>
                      <button type="button" aria-label={`Remove ${p.name}`} className="text-muted-foreground hover:text-foreground" onClick={() => setMine((m) => m.filter((x) => x.id !== p.id))}><X className="size-4" /></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${p.when.now ? "bg-primary text-primary-foreground" : "bg-accent"}`}>{p.when.label}</span>
                      {p.native && <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">Florida native</span>}
                      {p.colors.map((c) => <span key={c.hex} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><span className="size-2.5 rounded-full" style={{ background: c.hex }} />{c.name}</span>)}
                    </div>
                    <p className="text-sm">{p.reason}</p>
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Why this plant</summary><ul className="list-disc pl-4 mt-1">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul></details>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {extra.length > 0 && (
            <div className="space-y-2">
              <button type="button" className="text-sm font-medium underline" onClick={() => setShowAll(!showAll)}>{showAll ? "Hide" : "Show"} {extra.length} more plants that fit</button>
              {showAll && (
                <ul className="flex flex-wrap gap-2">
                  {extra.map((c) => (
                    <li key={c.id}><button type="button" onClick={() => add(c)} className="inline-flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary"><Plus className="size-3.5" aria-hidden />{c.name}<span className="text-xs text-muted-foreground">· {c.when.label}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {err && <ErrorState message={err} />}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft aria-hidden /> Back</Button>
            <Button size="lg" className="h-11 px-6 text-base" onClick={create} disabled={busy === "save" || !mine.length}>
              {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : null} Create my garden <ArrowRight aria-hidden />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Your garden gets its own link. Next you&apos;ll see it bloom month by month, then you can move anything around, get a shopping list and simple care reminders.</p>
        </section>
      )}
    </div>
  );
}
