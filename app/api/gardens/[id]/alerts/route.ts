import { NextResponse } from "next/server";

import { alertViews, stormContext, syncGarden } from "@/lib/alerts";
import { getGarden } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET /api/gardens/:id/alerts[?active=1] → alerts with their task lists, plus nearby tropical storms (context). */
export async function GET(req: Request, ctx: RouteContext<"/api/gardens/[id]/alerts">) {
  const { id } = await ctx.params;
  const g = await getGarden(id);
  if (!g) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  await syncGarden(g);
  const active = new URL(req.url).searchParams.get("active") === "1";
  const [alerts, storms] = await Promise.all([alertViews(id, { activeOnly: active }), stormContext(g.site.lat, g.site.lon)]);
  return NextResponse.json({ alerts, storms, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
