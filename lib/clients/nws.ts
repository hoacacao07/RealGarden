/** NWS active alerts (api.weather.gov, no key; User-Agent from NWS_USER_AGENT). */
import type { NwsAlert } from "../types";
import { cached, fetchJson, fixture, liveOrFixture } from "./base";
import { isScenario, loadScenario } from "./openmeteo";

export async function getAlerts(lat: number, lon: number, scenario?: string | null): Promise<{ alerts: NwsAlert[]; source: string }> {
  if (isScenario(scenario)) {
    const a = loadScenario(scenario).alert;
    return { alerts: a ? [a] : [], source: "scenario" };
  }
  // 60 s cache (spec 7.2): the cron runs every 5 minutes and page loads share the result.
  return cached(`nws:${lat.toFixed(2)}:${lon.toFixed(2)}`, 60_000, async () => {
    const r = await liveOrFixture("nws", {
      live: async (signal) => {
        const j = await fetchJson<{ features: { id?: string; properties: Record<string, string> }[] }>(
          `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
          { signal, headers: { "User-Agent": process.env.NWS_USER_AGENT || "NativeScapeFL demo", Accept: "application/geo+json" } },
        );
        return j.features.map((f) => {
          const p = f.properties;
          return {
            event: p.event, headline: p.headline ?? p.event, description: p.description, severity: p.severity,
            id: p.id ?? f.id, sent: p.sent ?? null, onset: p.onset ?? p.effective ?? null, ends: p.ends ?? p.expires ?? null,
            urgency: p.urgency ?? null, certainty: p.certainty ?? null, instruction: p.instruction ?? null, url: p["@id"] ?? f.id ?? null,
          };
        });
      },
      fallback: () => fixture<{ alerts: NwsAlert[] }>("nws_alerts.json").alerts,
    });
    return { alerts: r.data, source: r.source };
  });
}
