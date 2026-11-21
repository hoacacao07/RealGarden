import { NextResponse } from "next/server";

import { checkAllAlerts } from "@/lib/alerts";
import { secretOk } from "@/lib/secret";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET or POST /api/cron/check-alerts with `Authorization: Bearer <CRON_SECRET>`. Called every 5 minutes by an
 * external scheduler (GitHub Actions or cron-job.org; Vercel Hobby cron only runs daily). The only background job.
 */
async function run(req: Request) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set on the server." }, { status: 503 });
  if (!secretOk(bearer, process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t0 = Date.now();
  try {
    const r = await checkAllAlerts();
    return NextResponse.json({ ok: true, ...r, ms: Date.now() - t0, at: new Date().toISOString() });
  } catch (e) {
    console.error("[cron] check-alerts failed", e);
    return NextResponse.json({ error: "Alert check failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
