"use client";

import { useState } from "react";
import { Bug, Droplets, Snowflake, Sparkles, Wind } from "lucide-react";

import { SampleTag } from "@/components/plant-bits";
import { SEVERITY_STYLE } from "@/lib/format";
import type { AlertOut } from "@/lib/predict";

const ICON = { frost: <Snowflake aria-hidden />, storm: <Wind aria-hidden />, water: <Droplets aria-hidden />, disease: <Bug aria-hidden /> };
const SOURCE = { gemini: "Steps written by Gemini", fixture: "Steps by Gemini (saved demo response)", template: "Steps from a standard checklist" };

export function AlertCard({ alert }: { alert: AlertOut }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  return (
    <article className={`rounded-2xl border bg-card p-4 space-y-3 ${alert.severity === "high" ? "border-coral shadow-[0_0_0_3px_color-mix(in_oklch,var(--coral)_18%,transparent)]" : ""}`}
      aria-label={`${alert.severity} ${alert.type} alert`}>
      <header className="flex gap-3 items-start">
        <span className={`rounded-xl border p-2 [&_svg]:size-5 ${SEVERITY_STYLE[alert.severity]}`}>{ICON[alert.type]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            {alert.type} · {alert.severity} {alert.sample && <SampleTag />}
          </p>
          <h3 className="font-semibold leading-snug">{alert.title}</h3>
        </div>
      </header>
      {alert.safety && (
        <p className="rounded-xl border-2 border-coral bg-coral/10 px-3 py-2 text-sm font-semibold text-[oklch(0.42_0.15_30)]" role="note">{alert.safety}</p>
      )}
      <p className="text-sm">{alert.body}</p>
      {alert.steps.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-secondary/50 p-3" aria-label="Action steps">
          {alert.steps.map((s, i) => (
            <li key={i}>
              <label className="flex gap-2 text-sm items-start cursor-pointer">
                <input type="checkbox" className="mt-1 accent-[var(--leaf)] size-4 shrink-0" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} />
                <span className={done[i] ? "line-through text-muted-foreground" : ""}><strong className="font-semibold">{s.when}:</strong> {s.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Sparkles className="size-3.5 mt-0.5 shrink-0" aria-hidden />
        <span><span className="font-medium">Why:</span> {alert.why} {SOURCE[alert.source]}.</span>
      </p>
    </article>
  );
}
