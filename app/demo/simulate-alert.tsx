"use client";

/** Presenter: Simulate NWS alert (spec 7.5). Same pipeline as a real alert, marked as sample data. */
import { useState } from "react";
import { CloudLightning, CloudRain, Loader2, Snowflake, Waves } from "lucide-react";

import { rememberGarden } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";

const KEY = "nativescape.demoToken";
const TYPES = [
  { v: "hurricane_warning", l: "Hurricane Warning", icon: <CloudLightning aria-hidden /> },
  { v: "flash_flood_warning", l: "Flash Flood Warning", icon: <Waves aria-hidden /> },
  { v: "freeze_warning", l: "Freeze Warning", icon: <Snowflake aria-hidden /> },
  { v: "heavy_rain", l: "Heavy rain", icon: <CloudRain aria-hidden /> },
];

function token() {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function SimulateAlert() {
  const [garden, setGarden] = useState("maria");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(method: "POST" | "DELETE", type?: string) {
    const t = token();
    if (!t) { setMsg({ ok: false, text: "Enter the presenter token in the reset box above and press Reset once." }); return; }
    setBusy(type ?? "end");
    setMsg(null);
    try {
      const r = await fetch("/api/demo/simulate-alert", { method, headers: { "Content-Type": "application/json", "x-demo-token": t }, body: JSON.stringify({ garden_id: garden, type }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      rememberGarden(garden);
      setMsg({ ok: true, text: method === "POST" ? `${j.event} sent to ${garden}. The banner appears on every page within 15 s.` : `Ended ${j.ended} sample alert${j.ended === 1 ? "" : "s"}: tasks closed, follow-ups added.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-4 space-y-3" aria-labelledby="sim-h">
      <h2 id="sim-h" className="font-semibold">Simulate NWS alert</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Garden:
        {["maria", "linh"].map((g) => (
          <button key={g} type="button" role="radio" aria-checked={garden === g} onClick={() => setGarden(g)} className="rounded-lg border px-3 py-1 capitalize aria-checked:bg-primary aria-checked:text-primary-foreground">{g}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Button key={t.v} variant="outline" onClick={() => send("POST", t.v)} disabled={!!busy}>
            {busy === t.v ? <Loader2 className="animate-spin" aria-hidden /> : t.icon} {t.l}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => send("DELETE")} disabled={!!busy}>{busy === "end" && <Loader2 className="animate-spin" aria-hidden />} End sample alerts</Button>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? "text-muted-foreground" : "text-coral"}`}>{msg.text}</p>}
      <p className="text-xs text-muted-foreground">Inserts a synthetic alert marked as sample data and runs the real pipeline: rule tasks, banner, and Web Push to subscribers.</p>
    </section>
  );
}
