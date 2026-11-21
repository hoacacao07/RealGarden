import { NextResponse } from "next/server";

import { getZone } from "@/lib/clients/phzm";
import { getPlants } from "@/lib/data";
import { GARDEN_TYPES, matchPlants, SUNS, type GardenType } from "@/lib/engine/plantMatch";
import type { Light } from "@/lib/types";

/**
 * GET /api/plants/match?types=vegetable,fruit&sun=full_sun[&zip=33620]
 * → { zone, count, plants: [{ id, name, scientific_name, group, fit, reason, light, size_ft, permapeople_id }] }
 *
 * Plants come from Supabase's Plant table (lib/data.ts getPlants, Prisma over DATABASE_URL). The table is filled by
 * `npm run db:seed` from the catalog plus the reviewed Permapeople overlay.
 *   types  one or more of vegetable, fruit, herb, flower (comma separated)
 *   sun    full_sun | partial_shade | full_shade
 *   zip    optional Florida ZIP; adds a hardiness-zone filter
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const types = (q.get("types") ?? "").split(",").map((t) => t.trim()).filter((t): t is GardenType => GARDEN_TYPES.includes(t as GardenType));
  const sun = q.get("sun") as Light | null;
  const zip = q.get("zip");
  if (!types.length) return NextResponse.json({ error: `types must include one of: ${GARDEN_TYPES.join(", ")}` }, { status: 400 });
  if (!sun || !SUNS.includes(sun)) return NextResponse.json({ error: `sun must be one of: ${SUNS.join(", ")}` }, { status: 400 });
  if (zip && !/^\d{5}$/.test(zip)) return NextResponse.json({ error: "zip must be 5 digits" }, { status: 400 });

  try {
    const zone = zip ? (await getZone(zip))?.zone ?? null : null;
    const matches = matchPlants(await getPlants(), { types, sun, zone });
    return NextResponse.json({
      zone, count: matches.length,
      plants: matches.map(({ plant: p, group, fit, reason }) => ({
        id: p.id, name: p.common_name, scientific_name: p.scientific_name, group, fit, reason,
        light: p.light, water: p.water_need, size_ft: { height: p.mature_height_ft, spread: p.mature_spread_ft },
        permapeople_id: p.permapeople_id ?? null,
      })),
    });
  } catch (e) {
    console.error("[plants/match] failed", e);
    return NextResponse.json({ error: "Could not read plants. Is DATABASE_URL set and `npm run db:setup` done?" }, { status: 500 });
  }
}
