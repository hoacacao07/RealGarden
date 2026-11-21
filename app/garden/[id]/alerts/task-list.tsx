"use client";

import { useState } from "react";

import type { AlertView } from "@/lib/alerts";

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/** Alert task checklist; ticks are saved to the garden (anyone with the link). */
export function TaskList({ tasks }: { tasks: AlertView["tasks"] }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(tasks.map((t) => [t.id, t.done])));
  async function toggle(id: string, v: boolean) {
    setDone((d) => ({ ...d, [id]: v }));
    const r = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: v }) }).catch(() => null);
    if (!r?.ok) setDone((d) => ({ ...d, [id]: !v }));
  }
  return (
    <ol className="space-y-1.5">
      {tasks.map((t) => {
        const closed = !!t.closed_reason;
        return (
          <li key={t.id}>
            <label className={`flex gap-3 items-start rounded-xl p-2 ${closed ? "opacity-60" : "cursor-pointer hover:bg-muted"} ${t.priority === "urgent" && !closed ? "bg-coral/5" : ""}`}>
              <input type="checkbox" className="mt-1 size-4 accent-[var(--leaf)] shrink-0" checked={!!done[t.id]} disabled={closed} onChange={(e) => toggle(t.id, e.target.checked)} />
              <span className={`text-sm flex-1 ${done[t.id] ? "line-through text-muted-foreground" : ""}`}>
                {t.source === "followup" && <span className="mr-1 rounded bg-secondary px-1.5 text-xs font-medium">after</span>}
                {t.title}
                <span className="block text-xs text-muted-foreground">{closed ? t.closed_reason : `by ${time(t.due_at)}`}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ol>
  );
}
