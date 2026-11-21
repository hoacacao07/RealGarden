import { NextResponse } from "next/server";

import { getGarden, getPlants, updateGarden } from "@/lib/data";
import { BadRequest, parseGarden } from "@/lib/validate";

/** GET /api/gardens/:id → garden with site, zones, placements. */
export async function GET(_req: Request, ctx: RouteContext<"/api/gardens/[id]">) {
  const g = await getGarden((await ctx.params).id);
  return g ? NextResponse.json(g) : NextResponse.json({ error: "Garden not found" }, { status: 404 });
}

/** PUT /api/gardens/:id: replace name, theme, site, zones and placements. Anyone with the link can edit (demo). */
export async function PUT(req: Request, ctx: RouteContext<"/api/gardens/[id]">) {
  const { id } = await ctx.params;
  try {
    const plants = await getPlants();
    const body = parseGarden(await req.json(), new Set(plants.map((p) => p.id)));
    const ok = await updateGarden(id, body);
    return ok ? NextResponse.json({ id }) : NextResponse.json({ error: "Garden not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[gardens] update failed", e);
    return NextResponse.json({ error: "Could not save the garden. Try again." }, { status: 500 });
  }
}
