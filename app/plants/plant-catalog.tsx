"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { OriginBadge, YearSwatches } from "@/components/plant-bits";
import { PlantIcon } from "@/components/plant-icon";
import { Empty, UnverifiedBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { friendlyLine, groupOf, isBlocked, isNative } from "@/lib/catalog";
import { label } from "@/lib/format";
import type { Plant } from "@/lib/types";

/** Phase 11.6: filter by group (vegetable, herb, fruit, flower, native) and by themed garden. */
const GROUPS = ["vegetable", "herb", "fruit", "flower", "shrub_tree", "native"];
const GROUP_LABEL: Record<string, string> = { shrub_tree: "Shrubs & trees", native: "Florida natives" };
export interface ThemeChip { id: string; name: string; emoji: string; ids: string[] }

function Chips({ options, value, onChange, name, labels = {} }: { options: string[]; value: string; onChange: (v: string) => void; name: string; labels?: Record<string, string> }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {["", ...options].map((o) => (
        <button key={o || "all"} role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className="px-3 py-1 rounded-full border text-sm aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary hover:bg-muted aria-checked:hover:bg-primary">
          {o ? labels[o] ?? label(o) : `All ${name.toLowerCase()}`}
        </button>
      ))}
    </div>
  );
}

export function PlantCatalog({ plants, themes }: { plants: Plant[]; themes: ThemeChip[] }) {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [group, setGroup] = useState(sp.get("group") ?? "");
  const [theme, setTheme] = useState(sp.get("theme") ?? "");
  const [showBlocked, setShowBlocked] = useState(false);
  const themeIds = useMemo(() => new Map(themes.map((t) => [t.id, new Set(t.ids)])), [themes]);
  const dq = useDeferredValue(q.trim().toLowerCase());

  const shown = useMemo(
    () =>
      plants
        .filter((p) => !dq || p.common_name.toLowerCase().includes(dq) || p.scientific_name.toLowerCase().includes(dq))
        .filter((p) => !group || (group === "native" ? isNative(p) : groupOf(p) === group))
        .filter((p) => !theme || themeIds.get(theme)?.has(p.id))
        .filter((p) => showBlocked || !isBlocked(p))
        .sort((a, b) => a.common_name.localeCompare(b.common_name)),
    [plants, dq, group, theme, showBlocked, themeIds],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl bg-card border p-4">
        <label className="relative block">
          <span className="sr-only">Search plants</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by common or scientific name" className="pl-9 h-10" />
        </label>
        <Chips name="Plants" options={GROUPS} value={group} onChange={setGroup} labels={GROUP_LABEL} />
        <Chips name="Styles" options={themes.map((t) => t.id)} value={theme} onChange={setTheme} labels={Object.fromEntries(themes.map((t) => [t.id, `${t.emoji} ${t.name}`]))} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showBlocked} onChange={(e) => setShowBlocked(e.target.checked)} /> Show invasive plants (never suggested, shown so you can see what to swap)
        </label>
      </div>
      {shown.length === 0 ? (
        <Empty title="No plants match these filters" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.id}>
              <Link href={`/plants/${p.id}`} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition h-full">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-secondary p-2 h-fit"><PlantIcon category={p.category} /></div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{p.common_name}</p>
                    <p className="text-sm italic text-muted-foreground">{p.scientific_name}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <OriginBadge plant={p} />
                      <Badge variant="secondary">{GROUP_LABEL[groupOf(p)] ?? label(groupOf(p))}</Badge>
                      {!p.verified && <UnverifiedBadge />}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{friendlyLine(p)}</p>
                <div className="mt-auto"><YearSwatches plant={p} compact /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
