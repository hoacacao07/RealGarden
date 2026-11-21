"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Download, Hammer, Printer, Scissors, Shovel, Sprout, Droplets, ShieldAlert, ClipboardCheck, Leaf } from "lucide-react";

import { EstimateNote } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bagsFor, DEFAULT_BAG_FT3, lineTotal, shoppingList, toCsv, type ShopLine } from "@/lib/engine/shopping";
import { planCrops, restrictedText, taskCalendar, type FertRule, type Task, type TaskKind } from "@/lib/engine/tasks";
import { MONTH_NAMES } from "@/lib/format";
import type { PlanInputs } from "@/lib/plan";
import type { Region } from "@/lib/types";
import { useLocalJson } from "@/lib/use-local";

const KIND_ICON: Record<TaskKind, React.ReactNode> = {
  prep: <Hammer className="size-4" aria-hidden />, plant: <Sprout className="size-4" aria-hidden />, water: <Droplets className="size-4" aria-hidden />,
  fertilize: <Leaf className="size-4" aria-hidden />, harvest: <Scissors className="size-4" aria-hidden />, protect: <ShieldAlert className="size-4" aria-hidden />,
  check: <ClipboardCheck className="size-4" aria-hidden />,
};


export function PlanTabs({ gardenId, gardenName, initialTab, today, region, inputs, rule, targetHarvest, extraLines = [], soilExtra }: {
  gardenId: string; gardenName: string; initialTab: string; today: string; region: Region; inputs: PlanInputs; rule: FertRule;
  targetHarvest: string | null;
  /** Balcony mode adds container lines and replaces the soil tab body. */
  extraLines?: ShopLine[]; soilExtra?: React.ReactNode;
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="print:hidden">
        <TabsTrigger value="soil">Soil plan</TabsTrigger>
        <TabsTrigger value="shopping">Shopping list</TabsTrigger>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
      </TabsList>
      <TabsContent value="soil"><SoilTab inputs={inputs} extra={soilExtra} /></TabsContent>
      <TabsContent value="shopping"><ShoppingTab gardenId={gardenId} gardenName={gardenName} inputs={inputs} extraLines={extraLines} /></TabsContent>
      <TabsContent value="calendar"><CalendarTab gardenId={gardenId} today={today} region={region} inputs={inputs} rule={rule} initialTarget={targetHarvest} /></TabsContent>
    </Tabs>
  );
}

function SoilTab({ inputs, extra }: { inputs: PlanInputs; extra?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {extra}
      <ul className="grid gap-4 md:grid-cols-2">
        {inputs.soil.map((s) => (
          <li key={s.zone_kind} className="rounded-2xl border bg-card p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Shovel className="size-4" aria-hidden /> {s.zone_kind === "edible" ? "Edible zone" : "Native landscape"}
            </p>
            <p className="text-xl font-semibold">{s.title}</p>
            <ul className="text-sm list-disc pl-5 space-y-1">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </li>
        ))}
      </ul>
      <EstimateNote>Rules of thumb from UF/IFAS guidance. A soil test from the UF/IFAS Extension Soil Testing Laboratory beats any estimate.</EstimateNote>
    </div>
  );
}

function ShoppingTab({ gardenId, gardenName, inputs, extraLines }: { gardenId: string; gardenName: string; inputs: PlanInputs; extraLines: ShopLine[] }) {
  const [saved, save] = useLocalJson<{ bag: number; mix: "bagged" | "1:1:1"; prices: Record<string, number | null> }>(
    `shop:${gardenId}`, { bag: DEFAULT_BAG_FT3, mix: "bagged", prices: {} },
  );
  const { bag, mix, prices } = saved;
  const setBag = (v: number) => save({ ...saved, bag: v });
  const setMix = (v: "bagged" | "1:1:1") => save({ ...saved, mix: v });
  const setPrices = (v: Record<string, number | null>) => save({ ...saved, prices: v });

  const lines = useMemo(() => {
    const base = shoppingList({ ...inputs.shopping, bagFt3: bag, mix });
    const plantsEnd = base.filter((l) => l.category === "plants").length;
    // Bagged lines from balcony mode carry their volume, so they follow the bag size too.
    const extra = extraLines.map((l) => (l.volume_ft3 != null ? { ...l, qty: bagsFor(l.volume_ft3, bag), unit: `bags (${bag} ft³)` } : l));
    return [...base.slice(0, plantsEnd), ...extra, ...base.slice(plantsEnd)];
  }, [inputs.shopping, bag, mix, extraLines]);
  const priced = lines.map((l) => lineTotal(l, prices[l.id])).filter((v): v is number => v != null);
  const total = priced.reduce((s, v) => s + v, 0);
  const hasBed = inputs.shopping.raisedBeds.length > 0;

  function download() {
    const blob = new Blob([toCsv(lines, prices)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${gardenName.replace(/[^\w]+/g, "-").toLowerCase()}-shopping-list.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div className="space-y-1">
          <Label htmlFor="bag">Bag size (ft³)</Label>
          <Input id="bag" type="number" min={0.25} step={0.25} value={bag} className="h-9 w-24" onChange={(e) => setBag(Math.max(0.25, Number(e.target.value) || DEFAULT_BAG_FT3))} />
        </div>
        {hasBed && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Raised bed fill</legend>
            <div className="flex gap-2" role="radiogroup" aria-label="Raised bed fill">
              {([["bagged", "Bagged raised-bed soil"], ["1:1:1", "1:1:1 compost, peat, vermiculite"]] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={mix === v} onClick={() => setMix(v)}
                  className="px-3 py-1.5 rounded-lg border bg-card text-sm aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground">{l}</button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex-1" />
        <Button variant="outline" onClick={download}><Download aria-hidden /> CSV</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer aria-hidden /> Print</Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr><th className="p-3 font-medium">Item</th><th className="p-3 font-medium text-right">Qty</th><th className="p-3 font-medium">Unit</th>
              <th className="p-3 font-medium print:hidden">Your unit price</th><th className="p-3 font-medium text-right">Total</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const t = lineTotal(l, prices[l.id]);
              return (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="p-3">
                    <span className="font-medium">{l.item}</span>{l.optional && <span className="text-muted-foreground"> (optional)</span>}
                    {l.note && <span className="block text-xs text-muted-foreground">{l.note}</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">{l.qty}</td>
                  <td className="p-3 text-muted-foreground">{l.unit}</td>
                  <td className="p-3 print:hidden">
                    <Input aria-label={`Unit price for ${l.item}`} type="number" min={0} step={0.01} placeholder="$" className="h-8 w-24"
                      value={prices[l.id] ?? ""} onChange={(e) => setPrices({ ...prices, [l.id]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
                  </td>
                  <td className="p-3 text-right tabular-nums">{t != null ? `$${t.toFixed(2)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {priced.length > 0 && (
            <tfoot><tr className="border-t"><td className="p-3 font-semibold" colSpan={4}>Total of the lines you priced</td><td className="p-3 text-right font-semibold tabular-nums">${total.toFixed(2)}</td></tr></tfoot>
          )}
        </table>
      </div>
      <EstimateNote>Quantities are estimates. We never invent store prices or links: add your own prices if you want a total. Fertilizer is for vegetables only; natives don&apos;t need it.</EstimateNote>
    </div>
  );
}

function CalendarTab({ gardenId, today, region, inputs, rule, initialTarget }: {
  gardenId: string; today: string; region: Region; inputs: PlanInputs; rule: FertRule; initialTarget: string | null;
}) {
  const [target, setTarget] = useState(initialTarget ?? "");
  const [done, setDone] = useLocalJson<Record<string, boolean>>(`tasks:${gardenId}`, {});
  const toggle = (id: string) => setDone({ ...done, [id]: !done[id] });

  const tasks = useMemo(() => {
    const crops = planCrops(inputs.crops, region, today, target || null);
    return taskCalendar({ today, region, crops, soil: inputs.soil, rule, hasLandscape: inputs.soil.some((s) => s.zone_kind === "landscape") });
  }, [inputs, region, today, target, rule]);

  const byMonth = new Map<string, Task[]>();
  for (const t of tasks) byMonth.set(t.due_at.slice(0, 7), [...(byMonth.get(t.due_at.slice(0, 7)) ?? []), t]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-[oklch(0.75_0.13_70)] bg-[oklch(0.97_0.04_85)] p-4 text-sm space-y-1">
        <p className="font-semibold">Check your local fertilizer ordinance</p>
        <p>{rule.name}: no nitrogen or phosphorus fertilizer {restrictedText(rule)}. Fertilizer tasks that fall in this window are moved. {" "}
          <a className="underline" href={rule.source_url} target="_blank" rel="noreferrer">Source</a> (not yet verified).</p>
      </div>
      {inputs.crops.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="space-y-1">
            <Label htmlFor="target">Target harvest date (optional)</Label>
            <Input id="target" type="date" value={target} min={today} className="h-9 w-44" onChange={(e) => setTarget(e.target.value)} />
          </div>
          {target && <Button variant="ghost" size="sm" onClick={() => setTarget("")}>Clear</Button>}
          <p className="text-sm text-muted-foreground max-w-md">With a target, planting dates are back-calculated: plant date = harvest date − days to harvest.</p>
        </div>
      )}
      {[...byMonth.entries()].map(([ym, list]) => (
        <section key={ym} className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><CalendarDays className="size-4 text-primary" aria-hidden /> {MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}</h2>
          <ul className="space-y-2">
            {list.map((t) => (
              <li key={t.id} className={`rounded-xl border bg-card p-3 flex gap-3 items-start ${done[t.id] ? "opacity-60" : ""}`}>
                <Checkbox id={`t-${t.id}`} checked={!!done[t.id]} onCheckedChange={() => toggle(t.id)} className="mt-1" />
                <label htmlFor={`t-${t.id}`} className="flex-1 min-w-0 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">{KIND_ICON[t.kind]} {t.kind}</span>
                    <span className="text-muted-foreground tabular-nums">{MONTH_NAMES[Number(t.due_at.slice(5, 7)) - 1]} {Number(t.due_at.slice(8, 10))}</span>
                  </span>
                  <span className={`block font-medium mt-1 ${done[t.id] ? "line-through" : ""}`}>{t.title}</span>
                  <span className="block text-sm text-muted-foreground">{t.detail}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <EstimateNote>Planting windows and days to harvest are placeholders until checked against the UF/IFAS Florida Vegetable Gardening Guide. Ticks are saved in this browser only.</EstimateNote>
    </div>
  );
}
