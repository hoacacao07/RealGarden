import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { SunStrip } from "@/components/balcony/sun-strip";
import { Button } from "@/components/ui/button";
import { getGarden, getPlants } from "@/lib/data";
import { sunStrip, sunSummary, typicalPotD } from "@/lib/engine/balconySun";
import { fertRuleFor } from "@/lib/engine/tasks";
import { planInputs } from "@/lib/plan";

import { PlanTabs } from "./plan-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Garden plan" };

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/** Soil plan, shopping list and task calendar for one garden (Phase 11). */
export default async function PlanPage({ params, searchParams }: PageProps<"/garden/[id]/plan">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && ["soil", "shopping", "calendar"].includes(sp.tab) ? sp.tab : "soil";
  const [garden, plants] = await Promise.all([getGarden(id), getPlants()]);
  if (!garden) notFound();
  const inputs = planInputs(garden, plants);
  const rule = fertRuleFor(garden.site.lat, garden.site.lon);
  const strip = garden.site.kind === "balcony" ? sunStrip(garden.site.lat, garden.site.lon, garden.site, typicalPotD(garden.site)) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/garden/${garden.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {garden.name}
        </Link>
        <Button variant="outline" asChild><Link href={`/design?garden=${garden.id}`}><Pencil aria-hidden /> Edit design</Link></Button>
      </div>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Get ready to plant</h1>
        <p className="text-muted-foreground">{garden.name} · {garden.site.name}</p>
      </header>
      <PlanTabs gardenId={garden.id} gardenName={garden.name} initialTab={tab} today={todayIso()} region={garden.site.region}
        inputs={inputs} rule={rule} targetHarvest={garden.starter.target_harvest} extraLines={inputs.balconyLines}
        soilExtra={strip && (
          <div className="rounded-2xl border bg-card p-5"><SunStrip hours={strip} summary={sunSummary(garden.site.facing_deg ?? 180, strip)} /></div>
        )} />
    </div>
  );
}
