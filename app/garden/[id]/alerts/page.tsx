import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck, Tornado } from "lucide-react";

import { PushToggle } from "@/components/alerts/push-toggle";
import { SampleTag } from "@/components/plant-bits";
import { alertViews, stormContext, syncGarden } from "@/lib/alerts";
import { getGarden } from "@/lib/data";

import { TaskList } from "./task-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts" };

const SOURCE: Record<string, string> = { nws: "National Weather Service", openmeteo: "Open-Meteo forecast (no NWS alert yet)", sample: "Sample alert (presenter demo)", nhc: "National Hurricane Center" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "now");

/** Live and past weather alerts with their task checklists (spec 7.4). */
export default async function AlertsPage({ params }: PageProps<"/garden/[id]/alerts">) {
  const { id } = await params;
  const g = await getGarden(id);
  if (!g) notFound();
  await syncGarden(g);
  const [alerts, storms] = await Promise.all([alertViews(id), stormContext(g.site.lat, g.site.lon)]);
  const active = alerts.filter((a) => a.active);
  const past = alerts.filter((a) => !a.active);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <Link href={`/garden/${g.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {g.name}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Weather alerts</h1>
          <p className="text-muted-foreground">Checked every few minutes for {g.site.name}. Garden tasks are for before the storm only.</p>
        </div>
        <PushToggle gardenId={g.id} />
      </header>

      {storms.map((s) => (
        <p key={s.id} className="rounded-2xl border bg-accent/60 p-3 text-sm flex items-center gap-2">
          <Tornado className="size-4" aria-hidden /> {s.name} ({s.classification}) is about {s.distance_km} km away. Context only: tasks start when the National Weather Service issues a watch or warning.
        </p>
      ))}

      {active.length === 0 ? (
        <div className="rounded-2xl border bg-card p-5 flex gap-3 items-center"><ShieldCheck className="size-6 text-primary" aria-hidden /><p>No active weather alerts for your garden.</p></div>
      ) : active.map((a) => (
        <article key={a.id} className={`rounded-2xl border bg-card p-5 space-y-3 ${a.safety ? "border-coral border-2" : ""}`}>
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex flex-wrap items-center gap-2">
              {SOURCE[a.source] ?? a.source} · issued {when(a.created_at)} {a.is_sample && <SampleTag />}
              {a.url && <a className="inline-flex items-center gap-1 underline normal-case" href={a.url} target="_blank" rel="noreferrer">NWS alert <ExternalLink className="size-3" aria-hidden /></a>}
            </p>
            <h2 className="text-xl font-semibold">{a.event}</h2>
            <p className="text-sm">{a.headline}</p>
            <p className="text-xs text-muted-foreground">Starts {when(a.onset)}{a.ends ? ` · ends ${when(a.ends)}` : ""}</p>
          </header>
          {a.safety && <p className="rounded-xl border-2 border-coral bg-coral/10 px-3 py-2 text-sm font-semibold text-[oklch(0.42_0.15_30)]" role="note">{a.safety}</p>}
          {a.instruction && <p className="text-sm rounded-xl bg-muted p-3"><strong>From the National Weather Service:</strong> {a.instruction}</p>}
          <TaskList tasks={a.tasks} />
        </article>
      ))}

      {past.length > 0 && (
        <section aria-labelledby="past-h" className="space-y-3">
          <h2 id="past-h" className="text-xl font-semibold">Past alerts</h2>
          {past.map((a) => (
            <details key={a.id} className="rounded-2xl border bg-card p-4">
              <summary className="cursor-pointer font-medium">{a.event} · {when(a.created_at)} {a.is_sample && <SampleTag />}</summary>
              <div className="mt-3"><TaskList tasks={a.tasks} /></div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
