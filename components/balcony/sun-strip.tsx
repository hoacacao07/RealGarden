/** 12-month direct-sun strip for a balcony (server-safe). Bars by hours; color by light category. */
import { lightFromHours } from "@/lib/engine/balconySun";
import { MONTHS, MONTH_NAMES } from "@/lib/format";

const COLOR = { full_sun: "bg-[oklch(0.8_0.15_85)]", partial_shade: "bg-[oklch(0.86_0.09_95)]", full_shade: "bg-[oklch(0.86_0.02_250)]" };
const LABEL = { full_sun: "Full sun (6+ h)", partial_shade: "Part sun (3 to 6 h)", full_shade: "Shade (under 3 h)" };

export function SunStrip({ hours, summary, highlight }: { hours: number[]; summary?: string; highlight?: number }) {
  const max = Math.max(8, ...hours);
  return (
    <figure className="space-y-2">
      {summary && <figcaption className="font-medium">{summary}</figcaption>}
      <div className="grid grid-cols-12 gap-1 items-end h-24" role="img"
        aria-label={`Direct sun hours by month: ${hours.map((h, i) => `${MONTH_NAMES[i]} ${h.toFixed(1)}`).join(", ")}`}>
        {hours.map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] tabular-nums text-muted-foreground">{h.toFixed(h % 1 ? 1 : 0)}</span>
            <div className={`w-full rounded-t ${COLOR[lightFromHours(h)]} ${highlight === i + 1 ? "ring-2 ring-foreground/60" : ""}`} style={{ height: `${Math.max(3, (h / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1 text-center text-[10px] text-muted-foreground">{MONTHS.map((m, i) => <span key={i}>{m}</span>)}</div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={`size-2.5 rounded-sm ${COLOR[k]}`} />{LABEL[k]}</span>
        ))}
      </div>
    </figure>
  );
}
