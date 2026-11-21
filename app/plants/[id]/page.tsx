import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Bird, Bug, Droplets, Snowflake, Sun, Waves, Wind } from "lucide-react";

import { InspectButton } from "@/components/inspector/inspect-button";
import { OriginBadge, Swatch, YearSwatches } from "@/components/plant-bits";
import { PlantIcon } from "@/components/plant-icon";
import { UnverifiedBadge } from "@/components/states";
import { getPlant, getPlants } from "@/lib/data";
import { windowText } from "@/lib/engine/edibles";
import { nativeSwap } from "@/lib/engine/recommend";
import { label, MONTH_NAMES, range } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/plants/[id]">): Promise<Metadata> {
  const p = await getPlant((await params).id);
  return { title: p?.common_name ?? "Plant" };
}

function Fact({ icon, title, value }: { icon: React.ReactNode; title: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex gap-3">
      <div className="text-primary mt-0.5" aria-hidden>{icon}</div>
      <div><dt className="text-xs text-muted-foreground">{title}</dt><dd className="font-medium">{value}</dd></div>
    </div>
  );
}

const months = (m: number[]) => (m.length ? m.map((x) => MONTH_NAMES[x - 1]).join(", ") : "—");

export default async function PlantPage({ params }: PageProps<"/plants/[id]">) {
  const { id } = await params;
  const [p, all] = await Promise.all([getPlant(id), getPlants()]);
  if (!p) notFound();
  const swap = nativeSwap(p, all);

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Link href="/plants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All plants
      </Link>
      <header className="flex flex-wrap gap-4 items-start">
        <div className="rounded-2xl bg-secondary p-3"><PlantIcon category={p.category} className="size-16" /></div>
        <div className="space-y-1 flex-1 min-w-60">
          <h1 className="text-3xl font-semibold">{p.common_name}</h1>
          <p className="italic text-muted-foreground">{p.scientific_name}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <OriginBadge plant={p} />
            <span className="rounded-full border px-2 py-0.5 text-xs">{label(p.category)}</span>
            {p.regions.map((r) => <span key={r} className="rounded-full border px-2 py-0.5 text-xs">{label(r)} FL</span>)}
            {!p.verified && <UnverifiedBadge />}
          </div>
        </div>
        <InspectButton plant={p} />
      </header>

      {swap && (
        <section className="rounded-2xl border-2 border-coral/60 bg-coral/5 p-4 space-y-3">
          <p className="font-semibold">{swap.message}</p>
          <ul className="flex flex-wrap gap-2">
            {swap.alternatives.map((a) => (
              <li key={a.id}>
                <Link href={`/plants/${a.id}`} className="inline-flex items-center gap-2 rounded-xl border bg-card px-3 py-2 hover:border-primary">
                  {a.flower_colors[0] && <Swatch hex={a.flower_colors[0].hex} />} {a.common_name} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          {p.habitat && <p className="text-sm text-muted-foreground">{p.habitat}</p>}
        </section>
      )}

      {p.origin === "native" && p.landscape_use && <p className="text-lg">{label(p.landscape_use)}. Found in {p.habitat}.</p>}

      {p.edible && (
        <section className="rounded-2xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold">Growing it in Florida</h2>
          <ul className="text-sm space-y-1">
            {(["north", "central", "south"] as const).map((r) => (
              <li key={r}><strong>{label(r)} Florida:</strong> plant {windowText(p.edible!.planting_windows[r])}</li>
            ))}
            <li><strong>Harvest:</strong> {p.edible.days_to_harvest[0]} to {p.edible.days_to_harvest[1]} days after planting, for about {p.edible.harvest_weeks} weeks</li>
            <li><strong>Spacing:</strong> {p.edible.spacing_in} in{p.edible.needs_staking ? " · needs a stake or cage" : ""}{p.edible.heavy_rain_sensitive ? " · sensitive to heavy rain" : ""}</li>
            {p.container_ok && <li><strong>Pots:</strong> at least {p.min_container_gal} gal{p.dwarf_variety ? `. ${p.dwarf_variety}` : ""}</li>}
          </ul>
          <p className="text-xs text-muted-foreground">Planting windows are placeholders until checked against the <a className="underline" href={p.edible.source_url} target="_blank" rel="noreferrer">UF/IFAS Florida Vegetable Gardening Guide</a>.</p>
        </section>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact icon={<Sun className="size-5" />} title="Light" value={p.light.map(label).join(", ")} />
        <Fact icon={<Droplets className="size-5" />} title="Water need" value={`${label(p.water_need)} (Kc ${p.kc})`} />
        <Fact icon={<Waves className="size-5" />} title="Salt tolerance" value={label(p.salt_tolerance)} />
        <Fact icon={<Wind className="size-5" />} title="Wind tolerance" value={label(p.wind_tolerance)} />
        <Fact icon={<Snowflake className="size-5" />} title="Cold hardy to" value={`${p.cold_hardy_f}°F`} />
        <Fact icon={<PlantIcon category="small_tree" className="size-5" />} title="Mature size"
          value={`${range(p.mature_height_ft)} tall, ${range(p.mature_spread_ft)} wide`} />
      </dl>

      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Through the year</h2>
        <YearSwatches plant={p} />
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <p className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Flowers:</span>
            {p.flower_colors.map((c) => <span key={c.hex} className="inline-flex items-center gap-1"><Swatch hex={c.hex} /> {c.name}</span>)}
            <span>· {months(p.bloom_months)}</span>
          </p>
          <p className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Fruit:</span>
            {p.fruit_colors.map((c) => <span key={c.hex} className="inline-flex items-center gap-1"><Swatch hex={c.hex} /> {c.name}</span>)}
            <span>· {months(p.fruit_months)}</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Bloom timing: {p.bloom_trigger === "gdd" ? `heat-driven (about ${p.bloom_gdd?.toLocaleString()} growing degree days, base ${p.gdd_base_f}°F)` : "seasonal"}.
          {p.years_to_first_bloom > 0 && ` First flowers about ${p.years_to_first_bloom} year${p.years_to_first_bloom > 1 ? "s" : ""} after planting.`}
          {p.dioecious && " Separate male and female plants: you need both for fruit."}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Bird className="size-4 text-primary" aria-hidden /> Wildlife value</h2>
          <p>{p.wildlife_value.length ? p.wildlife_value.map(label).join(", ") : "Not listed"}</p>
          {p.host_plant_for.length > 0 && <p className="text-sm">Larval host for <strong>{p.host_plant_for.join(", ")}</strong>.</p>}
        </section>
        <section className="rounded-2xl border bg-card p-4 space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><Bug className="size-4 text-coral" aria-hidden /> Watch for</h2>
          <p>{p.common_issues.length ? p.common_issues.map(label).join(", ") : "Few common problems"}</p>
          <p className="text-sm text-muted-foreground">
            Growth: {p.growth_rate}. Planted at about {p.planting_height_ft} ft, spaced {p.spacing_ft} ft apart. Roots ~{p.root_depth_in} in deep.
          </p>
        </section>
      </div>

      {!p.verified && (
        <p className="text-sm text-muted-foreground rounded-xl bg-muted p-3">
          Unverified: these values come from general horticultural knowledge. Check UF/IFAS Extension or the Florida Native Plant
          Society before relying on them.
        </p>
      )}
    </article>
  );
}
