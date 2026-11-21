import { NextResponse } from "next/server";

import { getReports } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET /api/reports → all disease reports (sample + shared check-ins), locations rounded to ~1 km. */
export async function GET() {
  return NextResponse.json({ reports: await getReports() }, { headers: { "Cache-Control": "no-store" } });
}
