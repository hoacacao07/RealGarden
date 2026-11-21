import { NextResponse } from "next/server";

import { actionPlan, type ActionContext } from "@/lib/ai/features";

const TYPES = ["frost", "storm", "water", "disease"] as const;

/**
 * POST /api/action-plan { type, plants?: string[], day?: string, details?: object }
 * → 3–6 short steps with times. Gemini when available, otherwise the saved response or a template.
 */
export async function POST(req: Request) {
  let b: { type?: string; plants?: string[]; day?: string; details?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  if (!TYPES.includes(b.type as (typeof TYPES)[number])) return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
  const plants = (b.plants ?? []).slice(0, 10).map(String);
  const ctx: ActionContext = {
    type: b.type as ActionContext["type"],
    vars: { plants: plants.join(", ") || "your plants", first: plants[0] ?? "your plants", day: b.day ?? "Tonight", first_text: "Follow the watering plan." },
    details: b.details ?? { type: b.type, plants },
  };
  return NextResponse.json(await actionPlan(ctx, () => [{ when: "Soon", text: "Check your plants and follow the alert." }]));
}
