import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileBadge } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ecoBundle, saveSeen } from "@/lib/eco";

import { EcoPanel } from "./eco-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sustainable" };

/**
 * Sustainable section (Phase 11.7). Optional: the main screens show no eco numbers. Eco score A to F, 8 estimate tiles,
 * up to 3 greener swaps (one click each) and an optional house-and-roof layer for better estimates. Tiles that
 * changed since the last visit are highlighted.
 */
export default async function SustainablePage({ params }: PageProps<"/garden/[id]/sustainable">) {
  const { id } = await params;
  const b = await ecoBundle(id);
  if (!b) notFound();
  const now = Object.fromEntries(b.report.metrics.map((m) => [m.id, m.raw]));
  const changed = b.seen
    ? b.report.metrics.filter((m) => m.raw != null && b.seen![m.id] != null && b.seen![m.id] !== m.raw).map((m) => ({ id: m.id, before: b.seen![m.id] as number, now: m.raw as number }))
    : [];
  const prevScore = b.seen?.__score ?? null;
  await saveSeen(id, { ...now, __score: b.report.score }).catch(() => undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/garden/${b.garden.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {b.garden.name}
        </Link>
        <Button variant="outline" asChild><Link href={`/garden/${b.garden.id}/sustainable/report`}><FileBadge aria-hidden /> Eco report card</Link></Button>
      </div>
      <header className="space-y-1">
        <p className="text-sm font-medium text-primary">Sustainable</p>
        <h1 className="text-3xl font-semibold">Your garden&apos;s impact</h1>
        <p className="text-muted-foreground max-w-3xl">
          Every number here is an estimate for your own yard: its water use, runoff, carbon and wildlife. A garden changes its
          microclimate, not the regional weather. Open &ldquo;How we calculate this&rdquo; on any tile for the formula and sources.
        </p>
      </header>
      <EcoPanel gardenId={b.garden.id} report={b.report} swaps={b.swaps} eco={b.eco} changed={changed} prevScore={prevScore}
        canvas={{ w: b.garden.canvas_w_ft, h: b.garden.canvas_h_ft }}
        dots={b.garden.placements.map((p) => ({ x: p.x_ft, y: p.y_ft }))} zones={b.garden.zones.map((z) => z.polygon)} />
    </div>
  );
}
