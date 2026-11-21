import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ChevronDown, CloudSun, Pencil, ShieldCheck, Shovel, ShoppingBasket } from "lucide-react";

import { ThisWeek } from "@/components/care/this-week";
import { AlertCard } from "@/components/dashboard/alert-card";
import { BalconyCard, PotWater } from "@/components/dashboard/balcony-cards";
import { ComingUpCard } from "@/components/dashboard/coming-up";
import { DashboardControls } from "@/components/dashboard/controls";
import { MiniBalcony } from "@/components/dashboard/mini-balcony";
import { MiniCanvas } from "@/components/dashboard/mini-canvas";
import { SoilCard } from "@/components/dashboard/soil-card";
import { WaterZones } from "@/components/dashboard/water-zones";
import { SampleTag } from "@/components/plant-bits";
import { Button } from "@/components/ui/button";
import { careBundle } from "@/lib/care";
import { scenarioList } from "@/lib/clients/openmeteo";
import { getGarden, getPlants } from "@/lib/data";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/garden/[id]">): Promise<Metadata> {
  const g = await getGarden((await params).id);
  return { title: g?.name ?? "Garden" };
}

function LearnMore({ id, title, icon, open, children }: { id: string; title: string; icon: React.ReactNode; open: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="group rounded-2xl border bg-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3">
        <span className="font-semibold flex items-center gap-2 [&_svg]:size-5 [&_svg]:text-primary">{icon}{title}</span>
        <span className="text-sm text-muted-foreground flex items-center gap-1">Learn more <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></span>
      </summary>
      <div className="px-4 pb-4 space-y-4">{children}</div>
    </details>
  );
}

/**
 * My Garden (shareable link), simple by default (spec 2B): alerts and "This week" first, the garden itself and what's
 * coming up next to them. Weather and soil details sit in closed "Learn more" panels. Predictions run on every load,
 * on Refresh and on "Replay scenario" (?scenario=cold_snap etc.).
 */
export default async function GardenPage({ params, searchParams }: PageProps<"/garden/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const scenario = typeof sp.scenario === "string" ? sp.scenario : null;
  const more = typeof sp.more === "string" ? sp.more : scenario ? "weather" : null;
  const [garden, plants] = await Promise.all([getGarden(id), getPlants()]);
  if (!garden) notFound();
  const care = await careBundle(garden, plants, scenario);
  const d = care.dashboard;
  const scenarios = scenarioList();
  const balcony = garden.site.kind === "balcony";
  const urgent = d.alerts.filter((a) => a.severity === "high" || a.safety);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{garden.site.name}</p>
          <h1 className="text-3xl font-semibold">{garden.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href={`/design?garden=${garden.id}`}><Pencil aria-hidden /> Edit design</Link></Button>
          <Button variant="outline" asChild><Link href={`/garden/${garden.id}/plan?tab=shopping`}><ShoppingBasket aria-hidden /> What to buy</Link></Button>
          <Button variant="outline" asChild><Link href={`/garden/${garden.id}/checkin`}><Camera aria-hidden /> Photo check-in</Link></Button>
          <Link href={`/garden/${garden.id}/sustainable`} className="self-center rounded-full border px-3 py-1.5 text-sm hover:border-primary hover:bg-secondary">🌱 See impact</Link>
        </div>
      </header>

      {d.scenario && (
        <div className="rounded-2xl border border-sky bg-accent/70 p-4 flex gap-3 items-start" role="status">
          <CloudSun className="size-5 mt-0.5 text-[oklch(0.45_0.1_230)] shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">Replaying: {d.scenario.title} <span className="font-normal text-muted-foreground">(“today” = {shortDate(d.today)})</span></p>
            <p className="text-muted-foreground">{d.scenario.description} Plant ages stay at today&apos;s real values.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          {urgent.map((a) => <AlertCard key={a.id} alert={a} />)}
          <ThisWeek gardenId={garden.id} items={care.week} today={d.today} summary={care.weekText} />
          <section aria-labelledby="alerts-h" className="space-y-3">
            <h2 id="alerts-h" className="text-xl font-semibold">Alerts</h2>
            {d.alerts.length === 0 ? (
              <div className="rounded-2xl border bg-card p-4 flex gap-3 items-center text-sm">
                <ShieldCheck className="size-6 text-primary" aria-hidden />
                <p>All clear for the next 7 days. No frost, storm or plant disease nearby.</p>
              </div>
            ) : d.alerts.filter((a) => !urgent.includes(a)).map((a) => <AlertCard key={a.id} alert={a} />)}
            {d.alerts.length > 0 && d.alerts.every((a) => urgent.includes(a)) && <p className="text-sm text-muted-foreground">See above.</p>}
          </section>
        </div>
        <div className="space-y-6">
          <section aria-labelledby="layout-h" className="space-y-2">
            <h2 id="layout-h" className="text-xl font-semibold">Your garden today</h2>
            {balcony
              ? <MiniBalcony site={garden.site} pots={d.pots} placed={d.placed} today={d.realToday} />
              : <MiniCanvas width={garden.canvas_w_ft} height={garden.canvas_h_ft} zones={garden.zones} placed={d.placed} today={d.realToday} />}
            <p className="text-xs text-muted-foreground">Tap a plant to see it in 3D. <Link className="underline" href={`/design?garden=${garden.id}&tab=colors`}>See colors month by month</Link></p>
          </section>
          <ComingUpCard items={d.comingUp} today={d.realToday} placed={d.placed} />
        </div>
      </div>

      <section id="learn-more" aria-label="More details" className="space-y-3">
        <LearnMore id="weather" title="Weather & your garden" icon={<CloudSun aria-hidden />} open={more === "weather"}>
          <p className="text-base">{care.weekText}</p>
          <DashboardControls gardenId={garden.id} scenario={d.scenario?.name ?? null} scenarios={scenarios} />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{balcony ? "Watering pots, next 7 days" : "Watering, next 7 days"}</h3>
            {d.stormPause && <p className="text-sm font-medium text-[oklch(0.45_0.15_30)]">Paused for the storm</p>}
          </div>
          {balcony ? <PotWater pots={d.pots} noDrip={!!garden.site.rules?.no_drip} /> : <WaterZones zones={d.zones} />}
          {!d.scenario && <p className="text-xs text-muted-foreground">Weather: {d.weatherSource}. Updated when you open this page or press Refresh.</p>}
        </LearnMore>
        <LearnMore id="soil" title={balcony ? "Your balcony" : "Your soil"} icon={<Shovel aria-hidden />} open={more === "soil"}>
          {balcony ? <BalconyCard garden={garden} pots={d.pots} month={Number(d.realToday.slice(5, 7))} /> : <SoilCard garden={garden} />}
        </LearnMore>
      </section>
      {d.alerts.some((a) => a.sample) && <p className="text-xs text-muted-foreground flex items-center gap-2"><SampleTag /> marks demo data that is not a real observation.</p>}
    </div>
  );
}
