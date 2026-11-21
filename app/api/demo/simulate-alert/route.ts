import { NextResponse } from "next/server";

import { readData } from "@/lib/clients/base";
import { endAlerts, ingest } from "@/lib/alerts";
import { prisma } from "@/lib/db";
import { getGarden, getPlants } from "@/lib/data";
import { secretOk } from "@/lib/secret";

const TYPES = ["hurricane_warning", "flash_flood_warning", "freeze_warning", "heavy_rain"] as const;
type SimType = (typeof TYPES)[number];

interface Fx { event: string; severity: string; urgency?: string; certainty?: string; headline: string; instruction: string | null; onset_hours: number; ends_hours: number; source?: string }

const token = (req: Request) => req.headers.get("x-demo-token");

/**
 * POST /api/demo/simulate-alert { garden_id, type } (presenter, x-demo-token = DEMO_RESET_TOKEN). Inserts a synthetic
 * alert marked is_sample and runs the same pipeline as a real one: rule tasks, optional Gemini rewording, Web Push,
 * and the banner on every page. DELETE { garden_id } ends the sample alerts (tasks close, follow-ups appear).
 */
export async function POST(req: Request) {
  if (!process.env.DEMO_RESET_TOKEN) return NextResponse.json({ error: "DEMO_RESET_TOKEN is not set on the server." }, { status: 503 });
  if (!secretOk(token(req), process.env.DEMO_RESET_TOKEN)) return NextResponse.json({ error: "Wrong presenter token." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { garden_id?: string; type?: string };
  if (!TYPES.includes(b.type as SimType)) return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
  const g = await getGarden(String(b.garden_id ?? ""));
  if (!g) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  const fx = readData<Fx>(`fixtures/nws/${b.type}.json`);
  const now = Date.now();
  const at = (h: number) => new Date(now + h * 3600e3).toISOString();
  const alert = await ingest(g, await getPlants(), {
    source: "sample", external_id: `sample:${b.type}:${now}`, sent: new Date(now).toISOString(),
    event: fx.event, severity: fx.severity, urgency: fx.urgency, certainty: fx.certainty, headline: fx.headline, instruction: fx.instruction,
    onset: at(fx.onset_hours), ends: at(fx.ends_hours), is_sample: true, raw: { simulated: true, type: b.type },
  });
  return NextResponse.json({ ok: true, alert_id: alert?.id ?? null, garden: g.id, event: fx.event });
}

export async function DELETE(req: Request) {
  if (!secretOk(token(req), process.env.DEMO_RESET_TOKEN)) return NextResponse.json({ error: "Wrong presenter token." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { garden_id?: string };
  const g = await getGarden(String(b.garden_id ?? ""));
  if (!g) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  const ids = (await prisma.alert.findMany({ where: { garden_id: g.id, is_sample: true, active: true }, select: { id: true } })).map((a) => a.id);
  await endAlerts(g, ids);
  return NextResponse.json({ ok: true, ended: ids.length });
}
