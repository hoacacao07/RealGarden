import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health: is the deploy configured and can it reach Supabase? Never returns secret values, only whether each
 * setting is present and what shape the database URL has (host type and port), so a wrong connection string is easy
 * to spot.
 */
export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  let shape: Record<string, unknown> = { set: false };
  if (url) {
    try {
      const u = new URL(url);
      shape = {
        set: true,
        port: u.port || "5432",
        pooler: u.hostname.includes("pooler.supabase.com"),
        pgbouncer_param: u.searchParams.get("pgbouncer") === "true",
        direct_host: /^db\..*\.supabase\.co$/.test(u.hostname), // IPv6 only: does not work from Vercel
        password_has_brackets: decodeURIComponent(u.password).startsWith("["),
      };
    } catch {
      shape = { set: true, parse_error: "DATABASE_URL is not a valid URL" };
    }
  }
  const hints: string[] = [];
  if (!url) hints.push("DATABASE_URL is missing. Add it in Vercel → Settings → Environment Variables (Production), then redeploy.");
  if (shape.direct_host) hints.push("DATABASE_URL uses the Direct connection (db.xxx.supabase.co). Use the Transaction pooler string (port 6543) instead.");
  if (shape.set && shape.port !== "6543") hints.push("Use the Transaction pooler on port 6543 for DATABASE_URL.");
  if (shape.set && !shape.pgbouncer_param) hints.push("Add ?pgbouncer=true to the end of DATABASE_URL.");
  if (shape.password_has_brackets) hints.push("Remove the [ ] around the password in DATABASE_URL.");

  const started = Date.now();
  let db: Record<string, unknown>;
  try {
    const plants = await prisma.plant.count();
    const maria = await prisma.garden.count({ where: { id: "maria" } });
    db = { ok: true, plants, demo_garden_maria: maria === 1, ms: Date.now() - started };
    if (plants === 0) hints.push("Connected, but the Plant table is empty. Run `npm run db:setup` from a laptop.");
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg = (err.message ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(-1)[0] ?? "unknown error";
    db = { ok: false, code: err.code ?? null, error: msg.replace(/postgres(ql)?:\/\/\S+/g, "<url hidden>").slice(0, 300), ms: Date.now() - started };
    if (/auth|password/i.test(msg)) hints.push("Wrong database password in DATABASE_URL.");
    if (/does not exist|relation/i.test(msg)) hints.push("Tables are missing. Run `npm run db:setup` against this database.");
  }

  const env = Object.fromEntries(
    ["DEMO_MODE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "GEMINI_API_KEY", "GEMINI_MODEL", "NWS_USER_AGENT"]
      .map((k) => [k, k === "DEMO_MODE" ? (process.env[k] ?? "(not set → true)") : !!process.env[k]]),
  );
  return NextResponse.json(
    { ok: db.ok === true, db, database_url: shape, env, region: process.env.VERCEL_REGION ?? "local", hints },
    { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
