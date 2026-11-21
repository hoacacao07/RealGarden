/**
 * USDA Soil Data Access client (Phase 10). POSTs one SQL query for the dominant component's top horizon at a point.
 * DEMO_MODE (or any failure) uses data/fixtures/soil_sda.json, keyed by the point rounded to 2 decimals.
 * Results are cached in memory for 30 minutes.
 */
import { factsFromSurvey, sdaRows } from "../engine/soil";
import type { SoilFacts } from "../types";

import { cached, fetchJson, fixture, liveOrFixture } from "./base";

const URL = "https://sdmdataaccess.sc.egov.usda.gov/tabular/post.rest";
type SdaResponse = { Table?: (string | null)[][] };

/** Note SDA wants `point(lon lat)`. Inputs are numbers we validated, so string-building is safe. */
export function soilQuery(lat: number, lon: number): string {
  const pt = `point(${lon.toFixed(5)} ${lat.toFixed(5)})`;
  return `SELECT TOP 1 mu.muname, c.compname, c.drainagecl, c.hydgrp,
       ch.sandtotal_r, ch.claytotal_r, ch.om_r, ch.ph1to1h2o_r, ch.awc_r
FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${pt}') AS k
JOIN mapunit mu   ON mu.mukey = k.mukey
JOIN component c  ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'
JOIN chorizon ch  ON ch.cokey = c.cokey AND ch.hzdept_r = 0
ORDER BY c.comppct_r DESC`;
}

const key = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function fromFixture(lat: number, lon: number): SdaResponse {
  const all = fixture<Record<string, SdaResponse>>("soil_sda.json");
  return all[key(lat, lon)] ?? {};
}

export type SoilResult = SoilFacts & { urban: boolean; source_kind: "live" | "fixture"; found: boolean };

export async function getSoil(lat: number, lon: number): Promise<SoilResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("bad point");
  return cached(`soil:${key(lat, lon)}`, 30 * 60_000, async () => {
    const { data, source } = await liveOrFixture<SdaResponse>("soil", {
      live: (signal) => fetchJson<SdaResponse>(URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ query: soilQuery(lat, lon), format: "JSON+COLUMNNAME" }),
      }),
      fallback: () => fromFixture(lat, lon),
    });
    const row = sdaRows(data)[0] ?? null;
    return { ...factsFromSurvey(row), source_kind: source, found: !!row };
  });
}
