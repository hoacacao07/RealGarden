"use client";

import { useMemo } from "react";
import { Plus, Sparkles, TrendingDown } from "lucide-react";

import { Swatch } from "@/components/plant-bits";
import { Button } from "@/components/ui/button";
import { useDesign } from "@/lib/design-store";
import { beautyTimeline } from "@/lib/engine/beauty";
import { canopyAreaAt } from "@/lib/engine/growth";
import { monthName } from "@/lib/engine/phenology";
import type { Plant } from "@/lib/types";

import type { useModel } from "./model";
import { shownYear } from "./colors-tab";
import { YearControl } from "./plan-tab";

const FAMILY_HEX: Record<string, string> = {
  red: "#D7263D", orange: "#F07F1E", yellow: "#F4C21D", green: "#6E8E4A", blue: "#5A4FC4", purple: "#8E4FB0", pink: "#D774A3", white: "#F4F2EA", neutral: "#C7AE7C",
};

export function TimelineTab({ plants, model, onAdd }: { plants: Plant[]; model: ReturnType<typeof useModel>; onAdd: (p: Plant) => void }) {
  const s = useDesign();
  const tl = useMemo(
    () => beautyTimeline(
      model.items.map((g) => ({ plant: g.plant, canopy_sqft: canopyAreaAt(g.plant, shownYear(s.year)), can_bloom: shownYear(s.year) >= g.plant.years_to_first_bloom })),
      s.width * s.height, plants, s.site!.region,
    ),
    [model.items, s.year, s.width, s.height, plants, s.site],
  );
  const max = Math.max(1, ...tl.months.map((m) => m.score));

  return (
    <div className="space-y-4">
      <YearControl />
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Beauty through the year <span className="font-normal text-muted-foreground text-sm">· year {shownYear(s.year)}</span></h3>
          <p className="text-xs text-muted-foreground">Beauty = 40% bed fill + 40% share in bloom + 20% color variety</p>
        </div>
        <ol className="grid grid-cols-12 gap-1.5 items-end h-56" aria-label="Beauty score by month">
          {tl.months.map((m) => {
            const peak = tl.peak.includes(m.month);
            const weak = tl.weakest === m.month;
            return (
              <li key={m.month} className="flex flex-col items-center gap-1 h-full justify-end" title={`${monthName(m.month)}: ${m.score}. ${m.blooming.join(", ") || "Nothing in bloom"}`}>
                <span className={`text-xs tabular-nums ${peak ? "font-bold text-primary" : weak ? "font-bold text-coral" : "text-muted-foreground"}`}>{m.score}</span>
                <div className={`w-full rounded-t-lg ${peak ? "bg-primary" : weak ? "bg-coral" : "bg-primary/35"}`} style={{ height: `${(m.score / max) * 75}%`, minHeight: 4 }} />
                <div className="flex gap-0.5 h-2">{m.families.slice(0, 4).map((f) => <span key={f} className="size-2 rounded-full ring-1 ring-black/10" style={{ background: FAMILY_HEX[f] }} />)}</div>
                <span className={`text-xs ${peak || weak ? "font-semibold" : ""}`}>{monthName(m.month)}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 space-y-1">
          <p className="font-semibold flex items-center gap-2"><Sparkles className="size-4 text-primary" aria-hidden /> Peak: {tl.peak.map(monthName).join(", ")}</p>
          <p className="text-sm text-muted-foreground">{tl.months[tl.peak[0] - 1]?.blooming.join(", ") || "Add flowering plants to see a peak."}</p>
        </section>
        <section className="rounded-xl border border-coral/50 bg-coral/5 p-4 space-y-2">
          <p className="font-semibold flex items-center gap-2"><TrendingDown className="size-4 text-coral" aria-hidden /> Weakest: {monthName(tl.weakest)} ({tl.months[tl.weakest - 1].score})</p>
          {tl.suggestions.length ? (
            <>
              <p className="text-sm">Natives that bloom in {monthName(tl.weakest)}:</p>
              <div className="flex flex-wrap gap-2">
                {tl.suggestions.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" onClick={() => onAdd(p)}>
                    <Swatch hex={p.flower_colors[0].hex} /> <Plus aria-hidden /> {p.common_name}
                  </Button>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Your garden already has everything that blooms then.</p>}
        </section>
      </div>
    </div>
  );
}
