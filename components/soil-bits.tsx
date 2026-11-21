/** Soil display pieces shared by the wizard step and the dashboard card. Server-safe (no hooks). */
import { label } from "@/lib/format";
import type { Drainage, Soil, SoilFacts, SoilSource } from "@/lib/types";

const SOURCE: Record<SoilSource, { text: string; cls: string; title: string }> = {
  survey: { text: "USDA soil survey", cls: "bg-primary text-primary-foreground border-primary", title: "USDA NRCS Soil Data Access, dominant soil at this point" },
  user: { text: "Your edit", cls: "bg-secondary text-secondary-foreground border-[oklch(0.8_0.06_88)]", title: "Values you entered" },
  lab: { text: "Lab test", cls: "bg-[oklch(0.93_0.06_230)] text-[oklch(0.35_0.08_230)] border-sky", title: "UF/IFAS Extension Soil Testing Laboratory results you entered" },
  unknown: { text: "Unknown, check it", cls: "bg-[oklch(0.97_0.04_85)] text-[oklch(0.42_0.09_60)] border-[oklch(0.75_0.13_70)] border-dashed", title: "No reliable survey data here (built-up land or missing values)" },
};

export function SoilSourceBadge({ source }: { source: SoilSource | undefined }) {
  const s = SOURCE[source ?? "unknown"];
  return <span title={s.title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.text}</span>;
}

const fmt = (v: number | null | undefined, unit = "") => (v == null ? "not known" : `${v}${unit}`);

/** Type, pH, drainage, organic matter as a definition list. */
export function SoilFactsList({ facts, soil, drainage }: { facts: SoilFacts; soil: Soil; drainage: Drainage }) {
  const rows: [string, string][] = [
    ["Type", `${label(soil)}${facts.sand_pct != null ? ` (${facts.sand_pct}% sand)` : ""}`],
    ["pH", fmt(facts.ph)],
    ["Drainage", facts.drainage_class ?? label(drainage)],
    ["Organic matter", fmt(facts.om_pct, "%")],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
