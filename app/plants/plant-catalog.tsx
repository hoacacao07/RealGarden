"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { OriginBadge, YearSwatches } from "@/components/plant-bits";
import { PlantIcon } from "@/components/plant-icon";
import { Empty, UnverifiedBadge } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/format";
import type { Plant } from "@/lib/types";

const CATEGORIES = ["palm", "large_tree", "small_tree", "shrub", "wildflower", "grass", "vine", "fern", "aquatic", "vegetable", "herb"];
const THEMES = ["seaside", "water", "wildlife"];
const ORIGINS = ["native", "edible", "non_native"];

function Chips({ options, value, onChange, name }: { options: string[]; value: string; onChange: (v: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {["", ...options].map((o) => (
        <button key={o || "all"} role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className="px-3 py-1 rounded-full border text-sm aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary hover:bg-muted aria-checked:hover:bg-primary">
          {o ? label(o) : `All ${name.toLowerCase()}`}
        </button>
      ))}
    </div>
  );
}

export function PlantCatalog({ plants }: { plants: Plant[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [theme, setTheme] = useState("");
  const [origin, setOrigin] = useState("");
  const dq = useDeferredValue(q.trim().toLowerCase());

  const shown = useMemo(
    () =>
      plants
        .filter((p) => !dq || p.common_name.toLowerCase().includes(dq) || p.scientific_name.toLowerCase().includes(dq))
        .filter((p) => !category || p.category === category)
        .filter((p) => !theme || p.garden_themes.includes(theme as Plant["garden_themes"][number]))
        .filter((p) => !origin || p.origin === origin)
        .sort((a, b) => ORIGINS.indexOf(a.origin) - ORIGINS.indexOf(b.origin) || a.common_name.localeCompare(b.common_name)),
    [plants, dq, category, theme, origin],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl bg-card border p-4">
        <label className="relative block">
          <span className="sr-only">Search plants</span>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by common or scientific name" className="pl-9 h-10" />
        </label>
        <Chips name="Categories" options={CATEGORIES} value={category} onChange={setCategory} />
        <div className="flex flex-wrap gap-4">
          <Chips name="Themes" options={THEMES} value={theme} onChange={setTheme} />
          <Chips name="Origins" options={ORIGINS} value={origin} onChange={setOrigin} />
        </div>
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
                      <Badge variant="secondary">{label(p.category)}</Badge>
                      {!p.verified && <UnverifiedBadge />}
                    </div>
                  </div>
                </div>
                <div className="mt-auto"><YearSwatches plant={p} compact /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
