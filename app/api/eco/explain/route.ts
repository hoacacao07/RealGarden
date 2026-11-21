import { NextResponse } from "next/server";

import { ecoExplain } from "@/lib/ai/features";
import { ecoBundle } from "@/lib/eco";
import { allow, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/eco/explain { garden_id, metric } → 2 plain sentences about one estimate (Gemini, task eco_explain).
 * Falls back to the metric's own detail text.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { garden_id?: string; metric?: string };
  const bundle = typeof b.garden_id === "string" ? await ecoBundle(b.garden_id) : null;
  const m = bundle?.report.metrics.find((x) => x.id === b.metric);
  if (!bundle || !m) return NextResponse.json({ error: "Unknown garden or metric" }, { status: 404 });
  const fallback = `${m.title}: ${m.value}, an estimate. ${m.detail}`;
  if (!allow(`eco-explain:${clientIp(req)}`, 30)) return NextResponse.json({ text: fallback, source: "template" });
  return NextResponse.json(await ecoExplain({ metric: m.title, values: { value: m.value, detail: m.detail, score: m.score }, formula: m.formula }, fallback));
}
