import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/** PATCH /api/tasks/:id { done } (alert task checklist). Anyone with the garden link can tick tasks (demo). */
export async function PATCH(req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { done?: unknown };
  if (typeof b.done !== "boolean") return NextResponse.json({ error: "done must be true or false" }, { status: 400 });
  const r = await prisma.task.updateMany({ where: { id }, data: { done: b.done } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Task not found" }, { status: 404 });
}
