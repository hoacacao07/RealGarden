/** NWS active alerts (api.weather.gov, no key; User-Agent from NWS_USER_AGENT). */
import type { NwsAlert } from "../types";
import { cached, fetchJson, fixture, liveOrFixture } from "./base";
import { isScenario, loadScenario } from "./openmeteo";

export async function getAlerts(lat: number, lon: number, scenario?: string | null): Promise<{ alerts: NwsAlert[]; source: string }> {
  if (isScenario(scenario)) {
    const a = loadScenario(scenario).alert;
    return { alerts: a ? [a] : [], source: "scenario" };
  }
  return cached(`nws:${lat.toFixed(2)}:${lon.toFixed(2)}`, 30 * 60_000, async () => {
    const r = await liveOrFixture("nws", {
      live: async (signal) => {
        const j = await fetchJson<{ features: { properties: Record<string, string> }[] }>(
          `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
          { signal, headers: { "User-Agent": process.env.NWS_USER_AGENT || "NativeScapeFL demo", Accept: "application/geo+json" } },
        );
        return j.features.map((f) => ({ event: f.properties.event, headline: f.properties.headline ?? f.properties.event, description: f.properties.description, severity: f.properties.severity }));
      },
      fallback: () => fixture<{ alerts: NwsAlert[] }>("nws_alerts.json").alerts,
    });
    return { alerts: r.data, source: r.source };
  });
}
