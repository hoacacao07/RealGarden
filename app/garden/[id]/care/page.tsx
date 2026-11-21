import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";

import { ThisWeek } from "@/components/care/this-week";
import { AlertCard } from "@/components/dashboard/alert-card";
import { Button } from "@/components/ui/button";
import { careBundle } from "@/lib/care";
import { getGarden, getPlants } from "@/lib/data";
import { MONTH_NAMES } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Care" };

/** Care (spec 2B item 5): this week's list, alerts in plain language, and the next two months of the calendar. */
export default async function CarePage({ params }: PageProps<"/garden/[id]/care">) {
  const { id } = await params;
  const [garden, plants] = await Promise.all([getGarden(id), getPlants()]);
  if (!garden) notFound();
  const care = await careBundle(garden, plants, null, { reword: true });
  const d = care.dashboard;
  const soon = care.calendar.filter((t) => t.due_at > d.today && t.due_at <= addDaysIso(d.today, 60));
  const byMonth = new Map<string, typeof soon>();
  for (const t of soon) byMonth.set(t.due_at.slice(0, 7), [...(byMonth.get(t.due_at.slice(0, 7)) ?? []), t]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/garden/${garden.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {garden.name}
        </Link>
        <Button variant="outline" asChild><Link href={`/garden/${garden.id}/alerts`}><Bell aria-hidden /> Alerts and storm tasks</Link></Button>
      </div>
      <h1 className="text-3xl font-semibold">Care</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ThisWeek gardenId={garden.id} items={care.week} today={d.today} summary={care.weekText} />
          {care.wording === "gemini" && <p className="text-xs text-muted-foreground">Wording polished by Garden AI; the tasks come from our rules.</p>}
        </div>
        <section aria-labelledby="a-h" className="space-y-3">
          <h2 id="a-h" className="text-xl font-semibold">Alerts</h2>
          {d.alerts.length ? d.alerts.map((a) => <AlertCard key={a.id} alert={a} />) : <p className="rounded-2xl border bg-card p-4 text-sm">All clear for the next 7 days.</p>}
        </section>
      </div>
      <section aria-labelledby="cal-h" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cal-h" className="text-xl font-semibold">Coming up in the next 2 months</h2>
          <Link href={`/garden/${garden.id}/plan?tab=calendar`} className="text-sm underline">Full calendar</Link>
        </div>
        {soon.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            {[...byMonth.entries()].map(([ym, tasks]) => (
              <div key={ym} className="rounded-2xl border bg-card p-4">
                <h3 className="font-semibold mb-2">{MONTH_NAMES[Number(ym.slice(5, 7)) - 1]}</h3>
                <ul className="space-y-1 text-sm">
                  {tasks.map((t) => <li key={t.id}><span className="tabular-nums text-muted-foreground mr-2">{Number(t.due_at.slice(8, 10))}</span>{t.title}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
