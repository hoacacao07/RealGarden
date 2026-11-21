import { NextResponse } from "next/server";

import { confirmProposal } from "@/lib/assistant";

/**
 * POST /api/chat/confirm { garden_id, message_id, proposal_id, action: "confirm" | "dismiss" }
 * The only place a Garden Assistant write happens: the proposal is read from the stored answer, validated again,
 * then the task or plants are added.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const action = b.action === "dismiss" ? "dismiss" : "confirm";
  if (!s("garden_id") || !s("message_id") || !s("proposal_id")) return NextResponse.json({ error: "garden_id, message_id and proposal_id are required" }, { status: 400 });
  const r = await confirmProposal(s("garden_id"), s("message_id"), s("proposal_id"), action);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}
