import { NextResponse } from "next/server";

import { ecoBundle, saveEco } from "@/lib/eco";
import { BadRequest, parseEco } from "@/lib/validate";

/** GET /api/gardens/:id/eco → eco layer, report (8 metrics, Eco score) and up to 3 greener swaps. */
export async function GET(_req: Request, ctx: RouteContext<"/api/gardens/[id]/eco">) {
  const b = await ecoBundle((await ctx.params).id);
  if (!b) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
  return NextResponse.json({ eco: b.eco, report: b.report, swaps: b.swaps });
}

/** PUT /api/gardens/:id/eco: save the house and roof layer. */
export async function PUT(req: Request, ctx: RouteContext<"/api/gardens/[id]/eco">) {
  const { id } = await ctx.params;
  try {
    const eco = parseEco(await req.json());
    const b = await ecoBundle(id);
    if (!b) return NextResponse.json({ error: "Garden not found" }, { status: 404 });
    if (b.garden.site.kind === "balcony") Object.assign(eco, { house: null, lawn_sqft: 0, converted_lawn_sqft: 0, rain_garden_sqft: 0, surfaces: [] });
    await saveEco(id, eco);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[eco] save failed", e);
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }
}
