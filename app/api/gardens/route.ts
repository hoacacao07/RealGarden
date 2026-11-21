import { NextResponse } from "next/server";

import { createGarden, getPlants } from "@/lib/data";
import { BadRequest, parseGarden } from "@/lib/validate";

/** POST /api/gardens: create a garden (site, zones, placements). Returns { id }. */
export async function POST(req: Request) {
  try {
    const plants = await getPlants();
    const body = parseGarden(await req.json(), new Set(plants.map((p) => p.id)));
    const id = await createGarden(body);
    return NextResponse.json({ id, url: `/garden/${id}` }, { status: 201 });
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[gardens] create failed", e);
    return NextResponse.json({ error: "Could not save the garden. Try again." }, { status: 500 });
  }
}
