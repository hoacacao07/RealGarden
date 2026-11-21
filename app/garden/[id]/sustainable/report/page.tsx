import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ecoBundle, reportCard } from "@/lib/eco";

import { GradeBadge } from "../eco-panel";
import { ShareCard } from "./share-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eco report card" };

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

/** Eco report card (spec 6D.5): year 1 vs 5 vs 10, compared with a typical lawn yard of the same size. */
export default async function ReportPage({ params }: PageProps<"/garden/[id]/sustainable/report">) {
  const { id } = await params;
  const b = await ecoBundle(id);
  if (!b) notFound();
  const { years, lawn } = reportCard(b);
  const cols = [...years.map((y) => ({ label: `Year ${y.year}`, r: y.report })), { label: "Typical lawn yard", r: lawn }];
  const rows: { label: string; get: (r: (typeof cols)[number]["r"]) => string }[] = [
    { label: "Eco score", get: (r) => `${r.grade} · ${r.score}` },
    { label: "Water (gal/yr)", get: (r) => fmt(r.water.design_gal) },
    { label: "Runoff kept on site", get: (r) => (r.storm ? `${Math.round(r.storm.kept_pct)}%` : "n/a") },
    { label: "Nitrogen (lb/yr)", get: (r) => r.bay.n_lb_yr.toFixed(1) },
    { label: "Carbon (kg CO₂/yr)", get: (r) => fmt(r.carbon.kg_yr) },
    { label: "House shade", get: (r) => r.shade?.tier ?? "n/a" },
    { label: "Pollinator plants", get: (r) => `${r.pollinators.nectar} nectar, ${r.pollinators.host} host` },
    { label: "Food (lb/season)", get: (r) => fmt(r.food.lb_season) },
  ];
  const now = years[0].report;
  const saved = Math.max(0, lawn.water.design_gal - now.water.design_gal);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link href={`/garden/${b.garden.id}/sustainable`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Sustainable
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <GradeBadge grade={now.grade} score={now.score} />
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Eco report card</h1>
          <p className="text-muted-foreground">{b.garden.name}. About {fmt(saved)} gal of water a year less than a lawn yard the same size. All estimates.</p>
        </div>
      </header>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground"> </th>
              {cols.map((c, i) => <th key={c.label} className={`px-4 py-3 font-semibold ${i === cols.length - 1 ? "text-muted-foreground" : ""}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t">
                <th scope="row" className="px-4 py-2 text-left font-medium">{row.label}</th>
                {cols.map((c, i) => <td key={c.label} className={`px-4 py-2 tabular-nums capitalize ${i === cols.length - 1 ? "text-muted-foreground" : ""}`}>{row.get(c.r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Trees and shrubs grow over the years, so carbon and shade rise. Water and runoff assume established plants and a typical Tampa-area year.</p>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 space-y-3" aria-labelledby="mission-h">
          <h2 id="mission-h" className="text-lg font-semibold">Next green missions</h2>
          {b.swaps.length ? (
            <ol className="list-decimal pl-5 space-y-1 text-sm">{b.swaps.map((s) => <li key={s.id}>{s.title} <span className="text-primary font-medium">(+{s.delta})</span></li>)}</ol>
          ) : <p className="text-sm text-muted-foreground">No missions left. Nice work.</p>}
          <Link href={`/garden/${b.garden.id}/sustainable`} className="text-sm underline">Apply them in the Sustainable section</Link>
        </section>
        <ShareCard name={b.garden.name} grade={now.grade} score={now.score} lines={[
          `${fmt(saved)} gal/yr less water than a lawn`,
          `${fmt(years[2].report.carbon.kg_10yr)} kg CO₂ over 10 years`,
          `${now.pollinators.nectar} nectar and ${now.pollinators.host} host plants`,
          ...(now.storm ? [`${Math.round(now.storm.kept_pct)}% of storm runoff kept on site`] : []),
        ]} />
      </div>
    </div>
  );
}
