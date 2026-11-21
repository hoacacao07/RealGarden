import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { seedLinh, seedMaria, seedReports } from "@/lib/seed";

function tokenOk(given: string | null): boolean {
  const want = process.env.DEMO_RESET_TOKEN;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/demo/reset (presenter only): restores Maria's and Linh's gardens and the sample disease reports to their seeded state.
 * Needs `DEMO_RESET_TOKEN` in the `x-demo-token` header (or `{ "token": "…" }` body). Real shared check-in reports are kept.
 */
export async function POST(req: Request) {
  let token = req.headers.get("x-demo-token");
  if (!token) {
    try { token = ((await req.json()) as { token?: string }).token ?? null; } catch { token = null; }
  }
  if (!process.env.DEMO_RESET_TOKEN) return NextResponse.json({ error: "DEMO_RESET_TOKEN is not set on the server." }, { status: 503 });
  if (!tokenOk(token)) return NextResponse.json({ error: "Wrong reset token." }, { status: 401 });
  try {
    await seedMaria(prisma);
    await seedLinh(prisma);
    const reports = await seedReports(prisma);
    return NextResponse.json({ ok: true, gardens: ["maria", "linh"], sample_reports: reports, at: new Date().toISOString() });
  } catch (e) {
    console.error("[demo/reset] failed", e);
    return NextResponse.json({ error: "Reset failed. Check the database connection." }, { status: 500 });
  }
}
