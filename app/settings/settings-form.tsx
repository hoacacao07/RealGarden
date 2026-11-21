"use client";

/** Which garden is "my garden" in this browser, the native-plant preference, and alert notifications. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Leaf, Loader2 } from "lucide-react";

import { rememberGarden, useCurrentGarden } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PreferNatives } from "@/lib/types";

const PREF: { v: PreferNatives; l: string; d: string }[] = [
  { v: "off", l: "No preference", d: "Best fit for your yard, native or not" },
  { v: "some", l: "Some natives", d: "Natives get a boost in suggestions" },
  { v: "mostly", l: "Mostly natives", d: "Natives first; shows the native meter" },
];

export function SettingsForm() {
  const current = useCurrentGarden();
  const [link, setLink] = useState("");
  const [g, setG] = useState<{ name: string; prefer: PreferNatives } | null>(null);
  const [saving, setSaving] = useState<PreferNatives | null>(null);

  useEffect(() => {
    if (!current) return;
    let live = true;
    fetch(`/api/gardens/${current}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j) setG({ name: j.name, prefer: j.starter?.prefer_natives ?? "off" });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [current]);

  async function setPref(v: PreferNatives) {
    if (!current) return;
    setSaving(v);
    await fetch(`/api/gardens/${current}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefer_natives: v }) });
    setG((x) => (x ? { ...x, prefer: v } : x));
    setSaving(null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-5 space-y-3">
        <h2 className="text-lg font-semibold">My garden</h2>
        <p className="text-sm text-muted-foreground">There are no accounts: each garden has its own link, and this browser remembers the last one you opened.</p>
        <p className="text-sm">Current: {current ? <Link className="underline font-medium" href={`/garden/${current}`}>{g?.name ?? current}</Link> : "none yet"}</p>
        <div className="flex flex-wrap gap-2">
          {[["maria", "Maria's yard (demo)"], ["linh", "Linh's balcony (demo)"]].map(([id, l]) => (
            <Button key={id} variant={current === id ? "default" : "outline"} size="sm" onClick={() => rememberGarden(id)}>{current === id && <Check aria-hidden />}{l}</Button>
          ))}
          <Button variant="outline" size="sm" asChild><Link href="/start">Start a new garden</Link></Button>
        </div>
        <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); const id = link.trim().split("/garden/").pop()?.split(/[/?#]/)[0]; if (id) rememberGarden(id); setLink(""); }}>
          <Label htmlFor="glink" className="sr-only">Garden link</Label>
          <Input id="glink" placeholder="Paste a garden link" value={link} onChange={(e) => setLink(e.target.value)} />
          <Button type="submit" variant="outline">Use it</Button>
        </form>
      </section>

      {current && g && (
        <section className="rounded-2xl border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Leaf className="size-5 text-primary" aria-hidden /> Prefer native plants</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Prefer native plants">
            {PREF.map((o) => (
              <button key={o.v} type="button" role="radio" aria-checked={g.prefer === o.v} onClick={() => setPref(o.v)}
                className="text-left rounded-xl border-2 p-3 aria-checked:border-primary aria-checked:bg-secondary">
                <span className="font-medium flex items-center gap-1">{saving === o.v && <Loader2 className="size-4 animate-spin" aria-hidden />}{o.l}</span>
                <span className="block text-xs text-muted-foreground">{o.d}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Invasive plants are never suggested, whatever you pick.</p>
        </section>
      )}

      <section className="rounded-2xl border bg-card p-5 space-y-2" id="alerts">
        <h2 className="text-lg font-semibold">Weather alerts</h2>
        <p className="text-sm text-muted-foreground">Storm, flood and freeze alerts always show on your garden pages. Phone notifications are optional: turn them on from the Alerts page of your garden.</p>
        {current && <Button variant="outline" size="sm" asChild><Link href={`/garden/${current}/alerts`}>Open alerts</Link></Button>}
      </section>
    </div>
  );
}
