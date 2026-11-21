import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const PREF = ["off", "some", "mostly"] as const;
const TARGET = { off: null, some: 50, mostly: 75 } as const;

/** PATCH /api/gardens/:id/settings { prefer_natives?, name? } (Settings page). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/gardens/[id]/settings">) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { prefer_natives?: string; name?: string };
  const g = await prisma.garden.findUnique({ where: { id }, select: { site_id: true } });
  if (!g) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  const pref = PREF.find((p) => p === b.prefer_natives);
  if (b.prefer_natives !== undefined && !pref) return NextResponse.json({ error: "prefer_natives must be off, some or mostly" }, { status: 400 });
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : undefined;
  await prisma.garden.update({ where: { id }, data: { ...(pref && { prefer_natives: pref }), ...(name && { name }), updated_at: new Date() } });
  if (pref) await prisma.site.update({ where: { id: g.site_id }, data: { native_target_pct: TARGET[pref] } });
  return NextResponse.json({ ok: true });
}
