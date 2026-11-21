"use client";

/**
 * Red alert banner at the top of every page (spec 7.4) for the current garden. Live updates come from Supabase
 * Realtime on the Alert and Task tables when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set;
 * otherwise (and as a fallback) the banner polls every 15 s and on focus. A new alert opens its task list.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Tornado, X } from "lucide-react";

import { useCurrentGarden } from "@/components/site-chrome";

interface BannerAlert { id: string; event: string; headline: string; safety: string | null; is_sample: boolean; severity: string | null; tasks: { id: string; title: string; done: boolean; closed_reason: string | null }[] }
interface Storm { id: string; name: string; classification: string; distance_km: number; url: string | null }

export function AlertBanner() {
  const garden = useCurrentGarden();
  const [alerts, setAlerts] = useState<BannerAlert[]>([]);
  const [storms, setStorms] = useState<Storm[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    if (!garden) return;
    try {
      const r = await fetch(`/api/gardens/${garden}/alerts?active=1`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { alerts: BannerAlert[]; storms: Storm[] };
      const fresh = j.alerts.filter((a) => seen.current && !seen.current.has(a.id));
      if (fresh[0]) setOpen(fresh[0].id);
      seen.current = new Set(j.alerts.map((a) => a.id));
      setAlerts(j.alerts);
      setStorms(j.storms);
    } catch { /* offline: keep the last state */ }
  }, [garden]);

  useEffect(() => {
    if (!garden) return;
    seen.current = null;
    let stop = () => {};
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 15_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      import("@supabase/supabase-js").then(({ createClient }) => {
        const sb = createClient(url, key);
        const ch = sb.channel(`garden-${garden}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "Alert", filter: `garden_id=eq.${garden}` }, () => load())
          .on("postgres_changes", { event: "*", schema: "public", table: "Task", filter: `garden_id=eq.${garden}` }, () => load())
          .subscribe();
        stop = () => { sb.removeChannel(ch); };
      }).catch(() => undefined);
    }
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("focus", onFocus); stop(); };
  }, [garden, load]);

  const show = alerts.filter((a) => !hidden.includes(a.id));
  if (!garden || (!show.length && !storms.length)) return null;
  return (
    <div className="print:hidden" role="region" aria-label="Weather alerts">
      {show.map((a) => {
        const tasks = a.tasks.filter((t) => !t.closed_reason);
        const left = tasks.filter((t) => !t.done).length;
        const urgent = !!a.safety;
        return (
          <div key={a.id} className={urgent ? "bg-[oklch(0.5_0.19_27)] text-white" : "bg-[oklch(0.93_0.07_85)] text-[oklch(0.3_0.06_70)]"} role="alert">
            <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <AlertTriangle className="size-5 shrink-0" aria-hidden />
              <p className="font-semibold">{a.event}{a.is_sample && <span className="ml-1.5 rounded bg-black/15 px-1.5 text-xs font-medium">sample data</span>}</p>
              {a.safety && <p className="font-medium">{a.safety}</p>}
              <div className="flex-1" />
              <button className="inline-flex items-center gap-1 underline" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                {left} task{left === 1 ? "" : "s"} to do <ChevronDown className={`size-4 transition-transform ${open === a.id ? "rotate-180" : ""}`} aria-hidden />
              </button>
              <Link href={`/garden/${garden}/alerts`} className="font-semibold underline">Open checklist</Link>
              <button aria-label="Hide this alert banner" onClick={() => setHidden([...hidden, a.id])}><X className="size-4" /></button>
            </div>
            {open === a.id && (
              <ol className="mx-auto max-w-6xl px-4 pb-3 grid gap-1 sm:grid-cols-2 text-sm list-decimal list-inside">
                {tasks.slice(0, 6).map((t) => <li key={t.id} className={t.done ? "line-through opacity-70" : ""}>{t.title}</li>)}
              </ol>
            )}
          </div>
        );
      })}
      {storms.slice(0, 1).map((s) => (
        <div key={s.id} className="bg-[oklch(0.95_0.05_230)] text-[oklch(0.3_0.06_240)]">
          <div className="mx-auto max-w-6xl px-4 py-1.5 flex items-center gap-2 text-sm">
            <Tornado className="size-4" aria-hidden />
            <p><strong>Tropical storm watch:</strong> {s.name} ({s.classification}) is about {s.distance_km} km away. Keep an eye on official forecasts.</p>
            {s.url && <a className="underline ml-auto" href={s.url} target="_blank" rel="noreferrer">NHC advisory</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
