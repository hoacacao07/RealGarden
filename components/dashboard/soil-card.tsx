import Link from "next/link";
import { Shovel } from "lucide-react";

import { SoilFactsList, SoilSourceBadge } from "@/components/soil-bits";
import { soilTips } from "@/lib/engine/soil";
import type { GardenDoc } from "@/lib/types";

/** Dashboard soil card (Phase 10): type, pH, drainage, organic matter and where the numbers came from. */
export function SoilCard({ garden }: { garden: GardenDoc }) {
  const s = garden.site;
  const tips = soilTips({ ...s, urban: /urban land/i.test(s.survey_name ?? "") });
  return (
    <section aria-labelledby="soil-h" className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="soil-h" className="text-xl font-semibold flex items-center gap-2"><Shovel className="size-5 text-primary" aria-hidden /> Soil</h2>
        <SoilSourceBadge source={s.soil_source} />
      </div>
      {s.survey_name && <p className="text-sm text-muted-foreground">{s.survey_name}</p>}
      <SoilFactsList facts={s} soil={s.soil} drainage={s.drainage} />
      {tips.length > 0 && <ul className="space-y-1 text-sm">{tips.map((t) => <li key={t.key} className="rounded-lg bg-accent/60 px-3 py-1.5">{t.text}</li>)}</ul>}
      <p className="text-xs text-muted-foreground">
        Survey data from USDA NRCS Soil Data Access. <Link className="underline" href={`/design?garden=${garden.id}`}>Edit your soil</Link> after a home test or a UF/IFAS lab test.
      </p>
    </section>
  );
}
