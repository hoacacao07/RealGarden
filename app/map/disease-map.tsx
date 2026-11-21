"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { SampleTag } from "@/components/plant-bits";
import { Button } from "@/components/ui/button";
import type { ReportPoint } from "@/lib/types";

import { ISSUE_COLOR } from "./issue-colors";

const LeafletMap = dynamic(() => import("./leaflet-map"), { ssr: false, loading: () => <div className="h-[520px] rounded-2xl bg-muted/50 grid place-items-center text-muted-foreground">Loading map…</div> });

export function DiseaseMap({ initial, home, names }: { initial: ReportPoint[]; home: { lat: number; lon: number; name: string } | null; names: Record<string, string> }) {
  const [reports, setReports] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(21);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/reports", { cache: "no-store" });
      if (r.ok) setReports((await r.json()).reports);
    } finally {
      setBusy(false);
    }
  }, []);

  // New shared check-ins show up without a reload: refetch when the tab regains focus and every 30 s while open.
  useEffect(() => {
    const t = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => { clearInterval(t); window.removeEventListener("focus", load); };
  }, [load]);

  const issues = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const r of reports) m.set(r.issue_key, { label: r.label, n: (m.get(r.issue_key)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [reports]);

  const [now] = useState(() => Date.now());
  const cutoff = now - days * 86400e3;
  const shown = reports.filter((r) => !hidden.has(r.issue_key) && new Date(r.created_at).getTime() >= cutoff);
  const shared = reports.filter((r) => !r.is_sample).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="rounded-2xl border overflow-hidden relative">
        <LeafletMap reports={shown} home={home} names={names} />
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{shown.length} reports</p>
            <Button size="sm" variant="outline" onClick={load} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Refresh
            </Button>
          </div>
          <div role="group" aria-label="Time window" className="flex gap-1">
            {[7, 21, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)} aria-pressed={days === d}
                className="flex-1 rounded-lg border px-2 py-1 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary">
                {d} days
              </button>
            ))}
          </div>
          <ul className="space-y-1" aria-label="Issues (click to hide or show)">
            {issues.map(([key, v]) => (
              <li key={key}>
                <button onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                  aria-pressed={!hidden.has(key)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted aria-[pressed=false]:opacity-40">
                  <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: ISSUE_COLOR(key) }} aria-hidden />
                  <span className="flex-1 text-left">{v.label}</span><span className="tabular-nums text-muted-foreground">{v.n}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-2 text-sm">
          <p className="flex items-center gap-2"><SampleTag /> seeded for the demo</p>
          <p className="text-muted-foreground">{shared ? `${shared} real report${shared > 1 ? "s" : ""} shared from check-ins (solid outline).` : "No real check-ins shared yet. Try one from a garden's Photo check-in page."}</p>
          <p className="text-muted-foreground">Satellite greenness (NDVI) is not shown: satellites only resolve large areas like parks and campuses, not a single yard.</p>
        </div>
      </aside>
    </div>
  );
}
