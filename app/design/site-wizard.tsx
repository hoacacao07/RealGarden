"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";

import zipsJson from "@/data/zips.json";
import { PlantIcon } from "@/components/plant-icon";
import { BalconyStep, DEFAULT_BALCONY, type BalconyValue } from "@/components/balcony/balcony-step";
import { SoilStep, type SoilValue } from "@/components/soil-step";
import { EstimateNote, Loading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { balconyLight, sunStrip, typicalPotD } from "@/lib/engine/balconySun";
import { regionForLat } from "@/lib/engine/geo";
import { label } from "@/lib/format";
import type { SiteInput, Theme } from "@/lib/types";

const LocationMap = dynamic(() => import("@/components/location-map"), { ssr: false, loading: () => <Loading label="Loading map…" /> });
const ZIPS = zipsJson.zips as Record<string, { place: string; lat: number; lon: number; coast_mi: number }>;

function Seg<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{name}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
            className="px-3.5 py-2 rounded-xl border bg-card text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground hover:border-primary/60">
            {o.l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const THEMES: { id: Theme | null; title: string; blurb: string; icon: string }[] = [
  { id: "wildlife", title: "Butterfly & wildlife", blurb: "Nectar, host plants and berries.", icon: "wildflower" },
  { id: "seaside", title: "Seaside", blurb: "Salt spray and sandy soil.", icon: "palm" },
  { id: "water", title: "Rain garden", blurb: "Low spots that collect runoff.", icon: "aquatic" },
  { id: null, title: "No theme", blurb: "Rank purely on site fit.", icon: "shrub" },
];

export interface WizardResult { site: SiteInput; theme: Theme | null; name: string; place: string | null }

/**
 * Site for a balcony: light comes from the sun hours engine (a typical pot halfway back), not a sun question.
 * Pots hold potting mix, so soil is "sandy loam, fast drainage" with no survey; area = floor size.
 */
export function balconySite(b: BalconyValue, lat: number, lon: number, rest: Pick<SiteInput, "coastal_distance_mi" | "native_target_pct" | "name" | "zip">): SiteInput {
  return {
    ...rest, ...b, kind: "balcony", lat, lon, region: regionForLat(lat),
    sun: balconyLight(sunStrip(lat, lon, b, typicalPotD(b))),
    soil: "sandy_loam", drainage: "fast", soil_source: "unknown", area_sqft: Math.max(20, b.balcony_l_ft * b.balcony_w_ft),
  };
}

/** Location (ZIP or pin), soil (USDA survey + edits), sun, distance to coast, yard size, theme. */
export function SiteWizard({ initial, onDone, submitLabel = "Start designing", hideTheme = false, mode }: {
  initial?: Partial<WizardResult>; onDone: (r: WizardResult) => void; submitLabel?: string;
  /** The Garden Starter picks the theme from the goals, so it hides step 4. */
  hideTheme?: boolean;
  /** Balcony mode (Phase 11.5) swaps the soil step for the balcony profile; defaults to the site's own kind. */
  mode?: "yard" | "balcony";
}) {
  const balcony = (mode ?? initial?.site?.kind ?? "yard") === "balcony";
  const [bal, setBal] = useState<BalconyValue>(() => {
    const b = initial?.site;
    if (!b || b.kind !== "balcony") return DEFAULT_BALCONY;
    return {
      facing_deg: b.facing_deg ?? 180, floor_level: b.floor_level ?? 1, balcony_l_ft: b.balcony_l_ft ?? 10, balcony_w_ft: b.balcony_w_ft ?? 5,
      railing_ft: b.railing_ft ?? b.balcony_l_ft ?? 10, overhang_depth_ft: b.overhang_depth_ft ?? 0, overhang_height_ft: b.overhang_height_ft ?? 8.5,
      rules: b.rules ?? DEFAULT_BALCONY.rules,
    };
  });
  const [zip, setZip] = useState(initial?.site?.zip ?? "");
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lon: number; place: string | null } | null>(
    initial?.site ? { lat: initial.site.lat, lon: initial.site.lon, place: initial.place ?? null } : null,
  );
  const i = initial?.site;
  const [soil, setSoil] = useState<SoilValue>({
    soil: i?.soil ?? "sand", drainage: i?.drainage ?? "fast", soil_source: i?.soil_source ?? "unknown", survey_name: i?.survey_name ?? null,
    component: i?.component ?? null, drainage_class: i?.drainage_class ?? null, sand_pct: i?.sand_pct ?? null, clay_pct: i?.clay_pct ?? null,
    om_pct: i?.om_pct ?? null, ph: i?.ph ?? null, awc: i?.awc ?? null, is_fill: i?.is_fill ?? null,
  });
  const [site, setSite] = useState({
    sun: initial?.site?.sun ?? "full_sun",
    coastal_distance_mi: initial?.site?.coastal_distance_mi ?? 3, area_sqft: initial?.site?.area_sqft ?? 400,
    native_target_pct: initial?.site?.native_target_pct ?? 75,
  } as Pick<SiteInput, "sun" | "coastal_distance_mi" | "area_sqft" | "native_target_pct">);
  const [theme, setTheme] = useState<Theme | null>(initial?.theme === undefined ? "wildlife" : initial.theme);
  const [name, setName] = useState(initial?.name ?? "My native garden");

  function lookup() {
    const z = ZIPS[zip];
    if (!z) {
      setZipMsg("This demo knows a few Florida ZIPs. Drop a pin on the map instead.");
      return;
    }
    setZipMsg(null);
    setLoc({ lat: z.lat, lon: z.lon, place: z.place });
    setSite((s) => ({ ...s, coastal_distance_mi: z.coast_mi }));
  }

  const region = loc ? regionForLat(loc.lat) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-lg">1. Location</h2>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
            <Label htmlFor="zip">ZIP code</Label>
            <div className="flex gap-2">
              <Input id="zip" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} placeholder="33629" className="h-10" />
              <Button type="submit" size="lg" disabled={zip.length !== 5}>Find</Button>
            </div>
            {zipMsg && <p className="text-sm text-muted-foreground" role="status">{zipMsg}</p>}
          </form>
          <p className="text-sm text-muted-foreground">Or click the map to drop a pin on your yard.</p>
          {loc && region && (
            <div className="rounded-xl bg-secondary p-4 space-y-1" aria-live="polite">
              <p className="flex items-center gap-2 font-medium"><MapPin className="size-4 text-coral" aria-hidden />{loc.place ?? "Pinned location"}</p>
              <p className="text-sm">{loc.lat.toFixed(3)}, {loc.lon.toFixed(3)} · <strong>{label(region)} Florida</strong></p>
              <EstimateNote>Region comes from latitude bands (north ≥ 29.6°N, central ≥ 27.0°N), an approximation.</EstimateNote>
            </div>
          )}
        </section>
        <div className="rounded-2xl overflow-hidden border min-h-72">
          <LocationMap value={loc ? [loc.lat, loc.lon] : null} onPick={(lat, lon) => setLoc({ lat, lon, place: null })} />
        </div>
      </div>

      {balcony ? (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-lg">2. Your balcony</h2>
          <BalconyStep lat={loc?.lat ?? null} lon={loc?.lon ?? null} value={bal} onChange={setBal} />
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-lg">2. Your soil</h2>
          <SoilStep lat={loc?.lat ?? null} lon={loc?.lon ?? null} region={region} value={soil} onChange={setSoil} />
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-2 rounded-2xl border bg-card p-5">
        <h2 className="font-semibold text-lg md:col-span-2">3. Your site</h2>
        {!balcony && <Seg name="Sun" value={site.sun} onChange={(v) => setSite({ ...site, sun: v })}
          options={[{ v: "full_sun", l: "Full sun (6+ h)" }, { v: "partial_shade", l: "Part shade" }, { v: "full_shade", l: "Full shade" }]} />}
        <div className="space-y-3">
          <Label id="coast-l">Distance to the coast: <strong>{site.coastal_distance_mi} mi</strong></Label>
          <Slider aria-labelledby="coast-l" min={0} max={20} step={0.1} value={[site.coastal_distance_mi]}
            onValueChange={([v]) => setSite({ ...site, coastal_distance_mi: v })} />
          <p className="text-xs text-muted-foreground">Under 0.5 mi rules out salt-sensitive plants{balcony ? " (salt spray reaches balconies too)" : ""}.</p>
        </div>
        {!balcony && <div className="space-y-2">
          <Label htmlFor="area">Garden bed size (sq ft)</Label>
          <Input id="area" type="number" min={20} max={50000} value={site.area_sqft} className="h-10"
            onChange={(e) => setSite({ ...site, area_sqft: Math.max(20, Number(e.target.value) || 0) })} />
        </div>}
        <div className="space-y-2">
          <Label htmlFor="gname">Garden name</Label>
          <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
        </div>
      </section>

      {!hideTheme && <section className="space-y-3">
        <h2 className="font-semibold text-lg">4. Theme</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Garden theme">
          {THEMES.map((t) => (
            <button key={t.title} role="radio" aria-checked={theme === t.id} onClick={() => setTheme(t.id)}
              className="text-left rounded-2xl border-2 bg-card p-4 flex gap-3 items-start aria-checked:border-primary aria-checked:bg-secondary hover:border-primary/50">
              <PlantIcon category={t.icon} className="size-10" />
              <span><span className="block font-semibold">{t.title}</span><span className="text-sm text-muted-foreground">{t.blurb}</span></span>
            </button>
          ))}
        </div>
      </section>}

      <div className="flex justify-end">
        <Button size="lg" className="h-11 px-6 text-base" disabled={!loc}
          onClick={() => loc && onDone({
            name, theme, place: loc.place,
            site: balcony ? balconySite(bal, loc.lat, loc.lon, { ...site, name, zip: zip || null })
              : { ...site, ...soil, kind: "yard", name, lat: loc.lat, lon: loc.lon, zip: zip || null, region: regionForLat(loc.lat) },
          })}>
          {submitLabel} <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
