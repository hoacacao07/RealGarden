"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ClipboardList, Copy, LayoutDashboard, Loader2, Save, Settings2 } from "lucide-react";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { newKey, useDesign } from "@/lib/design-store";
import { balconyZone } from "@/lib/engine/balcony";
import { facingName } from "@/lib/engine/balconySun";
import { potDiameterIn } from "@/lib/engine/containerWater";
import { canvasSize, defaultZones, nextFreeSpot, nextFreeSpotIn, polyRect } from "@/lib/layout";
import type { GardenDoc, Plant } from "@/lib/types";

import { BalconyTab } from "./balcony-tab";
import { ColorsTab } from "./colors-tab";
import { useModel } from "./model";
import { NativeMeter } from "./native-meter";
import { PlanTab } from "./plan-tab";
import { Recommender } from "./recommender";
import { SiteWizard, type WizardResult } from "./site-wizard";
import { TimelineTab } from "./timeline-tab";

export function Studio({ plants, garden, initialTab = "plan" }: { plants: Plant[]; garden: GardenDoc | null; initialTab?: string }) {
  const router = useRouter();
  const init = useDesign((s) => s.init);
  const site = useDesign((s) => s.site);
  const initKey = garden ? `${garden.id}@${garden.updated_at}` : "new";
  const ready = useDesign((st) => st.initKey === initKey);
  const [editingSite, setEditingSite] = useState(false);
  const [newMode, setNewMode] = useState<"yard" | "balcony">("yard");
  const [active, setActive] = useState<Plant | null>(null);

  useEffect(() => {
    if (garden) {
      init({
        initKey, gardenId: garden.id, name: garden.name, theme: garden.theme, site: garden.site, width: garden.canvas_w_ft, height: garden.canvas_h_ft,
        zones: garden.zones, placements: garden.placements.map((p) => ({ ...p, key: p.id ?? newKey() })),
      });
    } else {
      init({ initKey, gardenId: null, site: null, placements: [], zones: [] });
    }
  }, [garden, init, initKey]);

  function applyWizard(r: WizardResult) {
    const isBalcony = r.site.kind === "balcony";
    const { width, height } = isBalcony
      ? { width: r.site.balcony_l_ft ?? 10, height: r.site.balcony_w_ft ?? 5 }
      : canvasSize(r.site.area_sqft);
    const st = useDesign.getState();
    // Editing an existing session keeps the layout, unless the site switched between yard and balcony.
    const keep = !!st.site && (st.site.kind === "balcony") === isBalcony;
    init({
      initKey: st.initKey, gardenId: st.gardenId, name: r.name, theme: r.theme, site: r.site,
      width: keep && !isBalcony ? st.width : width, height: keep && !isBalcony ? st.height : height,
      zones: isBalcony ? [balconyZone(width, height)] : keep && st.zones.length ? st.zones : defaultZones(width, height),
      placements: keep ? st.placements : [],
    });
    setEditingSite(false);
  }

  if (!ready) return null;
  if (!site || editingSite) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <div>
          <h1 className="text-3xl font-semibold">{site ? "Edit your site" : "Design a native garden"}</h1>
          <p className="text-muted-foreground">Tell us about the {site?.kind === "balcony" || (!site && newMode === "balcony") ? "balcony" : "yard"}. We rank Florida natives for it, natives first.</p>
        </div>
        {!site && (
          <div className="inline-flex rounded-xl border bg-card p-0.5" role="radiogroup" aria-label="Kind of garden">
            {([["yard", "Yard"], ["balcony", "Balcony or patio"]] as const).map(([v, l]) => (
              <button key={v} role="radio" aria-checked={newMode === v} onClick={() => setNewMode(v)}
                className="rounded-lg px-3 py-1.5 text-sm aria-checked:bg-primary aria-checked:text-primary-foreground">{l}</button>
            ))}
          </div>
        )}
        <SiteWizard
          initial={site ? { site, theme: useDesign.getState().theme, name: useDesign.getState().name } : undefined}
          submitLabel={site ? "Update site" : "Start designing"} onDone={applyWizard}
          mode={site ? (site.kind === "balcony" ? "balcony" : "yard") : newMode} key={site ? "edit" : newMode} />
      </div>
    );
  }
  return <Workspace plants={plants} active={active} setActive={setActive} onEditSite={() => setEditingSite(true)} router={router} initialTab={initialTab} />;
}

function Workspace({ plants, active, setActive, onEditSite, router, initialTab }: {
  plants: Plant[]; active: Plant | null; setActive: (p: Plant | null) => void; onEditSite: () => void; router: ReturnType<typeof useRouter>; initialTab: string;
}) {
  const s = useDesign();
  const model = useModel(plants);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState(initialTab);

  function addPlant(p: Plant, at?: { x_ft: number; y_ft: number }) {
    if (s.site?.kind === "balcony") {
      const gal = p.min_container_gal ?? 3;
      const d = potDiameterIn(gal) / 12;
      const spot = at ?? nextFreeSpotIn(s.placements, { x: 0, y: 0, w: s.width, h: s.height }, Math.max(1, d + 0.3)) ?? { x_ft: s.width / 2, y_ft: s.height / 2 };
      s.add([{ plant_id: p.id, ...spot, container_gal: gal, mount: "floor" }]);
      setActive(p);
      return;
    }
    const bed = p.origin === "edible" ? s.zones.find((z) => z.kind === "edible") : undefined;
    const inBed = !at && bed ? nextFreeSpotIn(s.placements, polyRect(bed.polygon), Math.max(0.5, p.spacing_ft)) : null;
    const spot = at ?? inBed ?? nextFreeSpot(s.placements, s.width, s.height, Math.max(2, p.spacing_ft));
    s.add([{ plant_id: p.id, ...spot }]);
    setActive(p);
  }

  async function save() {
    if (!s.site) return;
    setSaving(true);
    setErr(null);
    const body = {
      name: s.name, theme: s.theme, canvas_w_ft: s.width, canvas_h_ft: s.height, site: s.site, zones: s.zones,
      placements: s.placements.map(({ plant_id, zone_id, x_ft, y_ft, group_id, planted_on, container_gal, mount }) => ({ plant_id, zone_id, x_ft, y_ft, group_id, planted_on, container_gal, mount })),
    };
    try {
      const res = await fetch(s.gardenId ? `/api/gardens/${s.gardenId}` : "/api/gardens", {
        method: s.gardenId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      useDesign.setState({ dirty: false, gardenId: data.id });
      if (!s.gardenId) router.replace(`/design?garden=${data.id}`);
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!s.gardenId) return;
    await navigator.clipboard.writeText(`${location.origin}/garden/${s.gardenId}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Garden name" value={s.name} onChange={(e) => s.set({ name: e.target.value, dirty: true })}
          className="h-10 text-lg font-semibold w-auto min-w-64 flex-1 max-w-md" />
        <Button variant="ghost" onClick={onEditSite}><Settings2 aria-hidden /> {s.site!.kind === "balcony"
          ? <>Balcony: faces {facingName(s.site!.facing_deg ?? 180)}, floor {s.site!.floor_level ?? 1}, {s.site!.balcony_l_ft} × {s.site!.balcony_w_ft} ft</>
          : <>Site: {s.site!.sun.replace("_", " ")}, {s.site!.soil.replace("_", " ")}, {s.site!.coastal_distance_mi} mi to coast</>}</Button>
        <div className="flex-1" />
        <NativeMeter pct={model.native.by_count} byArea={model.native.by_area} target={s.site!.native_target_pct ?? null} />
        {s.gardenId && (
          <>
            <Button variant="outline" onClick={copyLink}>{copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Share link"}</Button>
            <Button variant="outline" asChild><Link href={`/garden/${s.gardenId}`}><LayoutDashboard aria-hidden /> Dashboard</Link></Button>
            <Button variant="outline" asChild><Link href={`/garden/${s.gardenId}/plan`}><ClipboardList aria-hidden /> Plan</Link></Button>
          </>
        )}
        <Button onClick={save} disabled={saving || (!s.dirty && !!s.gardenId)}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} {s.gardenId ? (s.dirty ? "Save" : "Saved") : "Save garden"}
        </Button>
      </div>
      {err && <ErrorState message={err} />}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr] items-start">
        <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto rounded-2xl border bg-secondary/40 p-3">
          <Recommender recs={model.recs} plants={plants} region={s.site!.region} onAdd={(p) => addPlant(p)} onPick={setActive} activeId={active?.id}
            ediblesOpen={s.zones.some((z) => z.kind === "edible")} ediblesLabel={s.site!.kind === "balcony" ? "Edibles for pots" : undefined} />
        </aside>
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="colors">Colors</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
          <TabsContent value="plan">
            {s.site!.kind === "balcony"
              ? <BalconyTab model={model} onDrop={(p, x, y) => addPlant(p, { x_ft: x, y_ft: y })} />
              : <PlanTab plants={plants} model={model} active={active} onDrop={(p, x, y) => addPlant(p, { x_ft: x, y_ft: y })} />}
          </TabsContent>
          <TabsContent value="colors"><ColorsTab plants={plants} model={model} active={active} setActive={setActive} onAdd={(p) => addPlant(p)} /></TabsContent>
          <TabsContent value="timeline"><TimelineTab plants={plants} model={model} onAdd={(p) => addPlant(p)} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
