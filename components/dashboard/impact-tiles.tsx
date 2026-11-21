import { Droplets, Flower2, Leaf, Sprout, Wrench } from "lucide-react";

import type { Impact } from "@/lib/engine/impact";
import { gallons, MONTH_NAMES } from "@/lib/format";

function Tile({ icon, value, label, sub, title }: { icon: React.ReactNode; value: string; label: string; sub?: string; title?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-1" title={title}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:text-primary">{icon}{label}</div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ImpactTiles({ impact, target }: { impact: Impact; target: number | null }) {
  const bm = impact.bloom_months;
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
      <Tile icon={<Leaf aria-hidden />} label="Native plants" value={`${Math.round(impact.native_pct.by_count)}%`}
        sub={target != null ? `${impact.native_pct.by_count >= target ? "Meets" : "Below"} your ${target}% goal` : `${Math.round(impact.native_pct.by_area)}% of canopy`}
        title="Share of plants that are Florida natives, by count" />
      <Tile icon={<Droplets aria-hidden />} label="Water saved this week" value={`${gallons(impact.gallons_saved_week)} gal`}
        sub="vs. a lawn watered twice a week" title="Turf baseline: Kc 0.8, timer on Wed and Sat, same area" />
      <Tile icon={<Sprout aria-hidden />} label="Pollinator score" value={`${impact.pollinator_score}/100`} sub="nectar + host plants" />
      <Tile icon={<Flower2 aria-hidden />} label="Bloom months" value={`${bm.length}/12`}
        sub={bm.length === 12 ? "something blooms all year" : `gap: ${MONTH_NAMES.filter((_, i) => !bm.includes(i + 1)).join(", ")}`} />
      <Tile icon={<Wrench aria-hidden />} label="Maintenance" value={impact.maintenance[0].toUpperCase() + impact.maintenance.slice(1)}
        sub={`${impact.plant_count} plants, ${impact.species_count} species`} />
    </div>
  );
}
