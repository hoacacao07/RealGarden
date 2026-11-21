import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/** POST /api/chat/feedback { message_id, value: 1 | -1 | 0 } → thumbs up/down on an answer (0 clears it). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { message_id?: unknown; value?: unknown };
  if (typeof b.message_id !== "string" || ![1, -1, 0].includes(b.value as number)) {
    return NextResponse.json({ error: "message_id and value (1, -1 or 0) are required" }, { status: 400 });
  }
  const r = await prisma.chatMessage.updateMany({ where: { id: b.message_id, role: "model" }, data: { feedback: b.value === 0 ? null : (b.value as number) } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Message not found" }, { status: 404 });
}
