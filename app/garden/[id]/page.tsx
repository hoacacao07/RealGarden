import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ClipboardList, CloudSun, Pencil, ShieldCheck } from "lucide-react";

import { AlertCard } from "@/components/dashboard/alert-card";
import { BalconyCard, PotWater } from "@/components/dashboard/balcony-cards";
import { ComingUpCard } from "@/components/dashboard/coming-up";
import { DashboardControls } from "@/components/dashboard/controls";
import { MiniBalcony } from "@/components/dashboard/mini-balcony";
import { MiniCanvas } from "@/components/dashboard/mini-canvas";
import { ImpactTiles } from "@/components/dashboard/impact-tiles";
import { SoilCard } from "@/components/dashboard/soil-card";
import { WaterZones } from "@/components/dashboard/water-zones";
import { SampleTag } from "@/components/plant-bits";
import { Button } from "@/components/ui/button";
import { scenarioList } from "@/lib/clients/openmeteo";
import { getGarden, getPlants } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { buildDashboard } from "@/lib/predict";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/garden/[id]">): Promise<Metadata> {
  const g = await getGarden((await params).id);
  return { title: g?.name ?? "Garden" };
}

/**
 * Garden dashboard (shareable link). Predictions run on every load: page load, Refresh (router.refresh)
 * and "Replay scenario" (?scenario=cold_snap etc.). No background jobs.
 */
export default async function GardenPage({ params, searchParams }: PageProps<"/garden/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const scenario = typeof sp.scenario === "string" ? sp.scenario : null;
  const [garden, plants] = await Promise.all([getGarden(id), getPlants()]);
  if (!garden) notFound();
  const d = await buildDashboard(garden, plants, scenario);
  const scenarios = scenarioList();
  const balcony = garden.site.kind === "balcony";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{garden.site.name} · {garden.site.region} Florida (by latitude) · {garden.site.coastal_distance_mi} mi from the coast</p>
          <h1 className="text-3xl font-semibold">{garden.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href={`/design?garden=${garden.id}`}><Pencil aria-hidden /> Edit design</Link></Button>
          <Button variant="outline" asChild><Link href={`/garden/${garden.id}/plan`}><ClipboardList aria-hidden /> Plan, shopping, calendar</Link></Button>
          <Button variant="outline" asChild><Link href={`/garden/${garden.id}/checkin`}><Camera aria-hidden /> Photo check-in</Link></Button>
        </div>
      </header>

      <DashboardControls gardenId={garden.id} scenario={d.scenario?.name ?? null} scenarios={scenarios} />

      {d.scenario ? (
        <div className="rounded-2xl border border-sky bg-accent/70 p-4 flex gap-3 items-start" role="status">
          <CloudSun className="size-5 mt-0.5 text-[oklch(0.45_0.1_230)] shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Replaying: {d.scenario.title} <span className="font-normal text-muted-foreground">(“today” = {shortDate(d.today)})</span></p>
            <p className="text-muted-foreground">{d.scenario.description} Plant ages stay at today&apos;s real values.</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Weather: {d.weatherSource}. Updated when you open this page or press Refresh.</p>
      )}

      <ImpactTiles impact={d.impact} target={garden.site.native_target_pct ?? null} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="alerts-h" className="space-y-3">
          <h2 id="alerts-h" className="text-xl font-semibold">Alerts and next steps</h2>
          {d.alerts.length === 0 ? (
            <div className="rounded-2xl border bg-card p-5 flex gap-3 items-center text-sm">
              <ShieldCheck className="size-6 text-primary" aria-hidden />
              <p>All clear for the next 7 days. No frost, storm or disease risk for your plants.</p>
            </div>
          ) : (
            d.alerts.map((a) => <AlertCard key={a.id} alert={a} />)
          )}
        </section>
        <div className="space-y-6">
          <ComingUpCard items={d.comingUp} today={d.realToday} placed={d.placed} />
          {balcony ? <BalconyCard garden={garden} pots={d.pots} month={Number(d.realToday.slice(5, 7))} /> : <SoilCard garden={garden} />}
        </div>
      </div>

      <section aria-labelledby="water-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="water-h" className="text-xl font-semibold">{balcony ? "Watering pots, next 7 days" : "Watering, next 7 days"}</h2>
          {d.stormPause && <p className="text-sm font-medium text-[oklch(0.45_0.15_30)]">Paused for the storm</p>}
        </div>
        {balcony ? <PotWater pots={d.pots} noDrip={!!garden.site.rules?.no_drip} /> : <WaterZones zones={d.zones} />}
      </section>

      <section aria-labelledby="layout-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="layout-h" className="text-xl font-semibold">Garden today</h2>
          <p className="text-sm text-muted-foreground">Click a plant to open it in the 3D inspector</p>
        </div>
        {balcony
          ? <MiniBalcony site={garden.site} pots={d.pots} placed={d.placed} today={d.realToday} />
          : <MiniCanvas width={garden.canvas_w_ft} height={garden.canvas_h_ft} zones={garden.zones} placed={d.placed} today={d.realToday} />}
        {d.alerts.some((a) => a.sample) && <p className="text-xs text-muted-foreground flex items-center gap-2"><SampleTag /> marks demo data that is not a real observation.</p>}
      </section>
    </div>
  );
}
