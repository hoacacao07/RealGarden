import { NextResponse } from "next/server";

import { applySwapById } from "@/lib/eco";

/** POST /api/gardens/:id/eco/swap { id } → applies one of the currently suggested greener swaps. */
export async function POST(req: Request, ctx: RouteContext<"/api/gardens/[id]/eco/swap">) {
  const { id } = await ctx.params;
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  if (typeof body.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  const r = await applySwapById(id, body.id);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 409 });
}
