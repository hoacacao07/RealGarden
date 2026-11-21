/** Small presentational pieces shared by catalog, design and dashboard. Server-safe (no hooks). */
import { colorInMonth } from "@/lib/engine/color";
import { badgeFor, BADGE_LABEL, type Badge as BadgeKind } from "@/lib/engine/recommend";
import { MONTH_NAMES } from "@/lib/format";
import type { Plant, Region } from "@/lib/types";

const BADGE_STYLE: Record<BadgeKind, string> = {
  native_here: "bg-primary text-primary-foreground border-primary",
  florida_native: "bg-secondary text-secondary-foreground border-[oklch(0.8_0.06_88)]",
  non_native: "bg-muted text-muted-foreground border-border",
  edible: "bg-[oklch(0.95_0.05_70)] text-[oklch(0.4_0.09_55)] border-[oklch(0.8_0.08_60)]",
  invasive: "bg-coral/15 text-[oklch(0.45_0.15_30)] border-coral",
};

export function OriginBadge({ plant, region = "central" }: { plant: Plant; region?: Region }) {
  const b = badgeFor(plant, region);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_STYLE[b]}`}>
      {BADGE_LABEL[b]}
    </span>
  );
}

export function SampleTag({ className = "" }: { className?: string }) {
  return (
    <span title="Invented for the demo, not a real observation"
      className={`inline-flex items-center rounded-full border border-dashed border-[oklch(0.7_0.1_70)] bg-[oklch(0.97_0.04_85)] px-2 py-0.5 text-[11px] font-medium text-[oklch(0.42_0.09_60)] ${className}`}>
      sample data
    </span>
  );
}

export function Swatch({ hex, className = "size-3" }: { hex: string; className?: string }) {
  return <span className={`inline-block rounded-full ring-1 ring-black/10 ${className}`} style={{ background: hex }} aria-hidden />;
}

/** 12 month swatches: flower color in bloom, fruit color when fruiting, foliage otherwise. */
export function YearSwatches({ plant, compact = false }: { plant: Plant; compact?: boolean }) {
  return (
    <ol className="grid grid-cols-12 gap-1" aria-label={`Colors through the year for ${plant.common_name}`}>
      {MONTH_NAMES.map((m, i) => {
        const c = colorInMonth(plant, i + 1);
        return (
          <li key={m} className="text-center" title={`${m}: ${c.kind === "flower" ? "in bloom" : c.kind === "fruit" ? "fruit" : "foliage"}`}>
            <div className={`${compact ? "h-3" : "h-7"} rounded-md ring-1 ring-black/5 ${c.kind === "foliage" ? "opacity-60" : ""}`} style={{ background: c.hex }} />
            {!compact && <span className={`text-[10px] ${c.kind !== "foliage" ? "font-semibold" : "text-muted-foreground"}`}>{m[0]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function ColorLegend() {
  return (
    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      <span>Bright = flowers or fruit that month</span>
      <span>Faded = leaves only</span>
    </p>
  );
}
