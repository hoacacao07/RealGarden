import { NextResponse } from "next/server";

import { getAlerts } from "@/lib/clients/nws";

/** GET /api/alerts?lat&lon&scenario → NWS active alerts, or the scenario's synthetic alert. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat") ?? 27.95);
  const lon = Number(u.searchParams.get("lon") ?? -82.46);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "lat and lon must be numbers" }, { status: 400 });
  return NextResponse.json(await getAlerts(lat, lon, u.searchParams.get("scenario")));
}
