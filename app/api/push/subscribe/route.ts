import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { allow, clientIp } from "@/lib/rate-limit";

/** POST /api/push/subscribe { garden_id, subscription: PushSubscriptionJSON } · DELETE { endpoint }. */
export async function POST(req: Request) {
  if (!allow(`push:${clientIp(req)}`, 20)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const b = (await req.json().catch(() => ({}))) as { garden_id?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  const s = b.subscription;
  if (typeof b.garden_id !== "string" || !s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) {
    return NextResponse.json({ error: "garden_id and a push subscription are required" }, { status: 400 });
  }
  const g = await prisma.garden.findUnique({ where: { id: b.garden_id }, select: { id: true } });
  if (!g) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  await prisma.pushSubscription.upsert({
    where: { endpoint: s.endpoint },
    create: { garden_id: g.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
    update: { garden_id: g.id, p256dh: s.keys.p256dh, auth: s.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (b.endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint } });
  return NextResponse.json({ ok: true });
}
