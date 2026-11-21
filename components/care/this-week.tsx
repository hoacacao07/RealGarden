"use client";

/** "This week" checklist. Ticks are kept in this browser (localStorage), keyed by garden and item. */
import { CalendarCheck, CloudLightning, Droplets, Scissors, ShieldAlert, Snowflake, Sprout, Umbrella, Wheat } from "lucide-react";

import { dayWord, type CareItem, type CareKind } from "@/lib/engine/careWeek";
import { useLocalJson } from "@/lib/use-local";

const ICON: Record<CareKind, React.ReactNode> = {
  storm: <CloudLightning aria-hidden />, cover: <Snowflake aria-hidden />, water: <Droplets aria-hidden />, skip: <Umbrella aria-hidden />,
  check: <ShieldAlert aria-hidden />, plant: <Sprout aria-hidden />, fertilize: <CalendarCheck aria-hidden />, harvest: <Wheat aria-hidden />, prep: <Scissors aria-hidden />,
};

export function ThisWeek({ gardenId, items, today, summary }: { gardenId: string; items: CareItem[]; today: string; summary?: string }) {
  const [done, setDone] = useLocalJson<Record<string, boolean>>(`nsfl:care:${gardenId}`, {});
  return (
    <section aria-labelledby="week-h" className="rounded-2xl border bg-card p-4 space-y-3">
      <h2 id="week-h" className="text-xl font-semibold">This week</h2>
      {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
      {items.length === 0 ? (
        <p className="text-sm">Nothing to do this week. Enjoy the garden.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.id}>
              <label className={`flex gap-3 items-start rounded-xl p-2 cursor-pointer hover:bg-muted ${i.urgent ? "bg-coral/10" : ""}`}>
                <input type="checkbox" className="mt-1 size-4 accent-[var(--leaf)] shrink-0" checked={!!done[i.id]} onChange={(e) => setDone({ ...done, [i.id]: e.target.checked })} />
                <span className="text-primary [&_svg]:size-4 mt-0.5">{ICON[i.kind]}</span>
                <span className={`text-sm flex-1 ${done[i.id] ? "line-through text-muted-foreground" : ""}`}>
                  <strong className="font-semibold">{dayWord(i.date, today)}:</strong> {i.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
