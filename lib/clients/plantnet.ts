/** Pl@ntNet identify (PLANTNET_API_KEY). Returns the top 5 species. */
import { fetchJson, fixture, liveOrFixture } from "./base";

export interface IdentifyResult {
  bestMatch: string | null;
  results: { score: number; species: { scientificNameWithoutAuthor: string; commonNames: string[] } }[];
}

/**
 * In fixture mode a demo photo returns its saved response. Any other upload returns the default
 * fixture, with the plant the user picked (if any) placed first so the flow stays coherent.
 */
export async function identify(image: { bytes: Buffer; mime: string }, demoPhoto?: string | null, hint?: { scientific: string; common: string } | null) {
  const r = await liveOrFixture("plantnet", {
    needs: [process.env.PLANTNET_API_KEY],
    live: async (signal) => {
      const form = new FormData();
      form.append("images", new Blob([new Uint8Array(image.bytes)], { type: image.mime }), "checkin.jpg");
      form.append("organs", "auto");
      const project = process.env.PLANTNET_PROJECT || "all";
      const url = `https://my-api.plantnet.org/v2/identify/${project}?api-key=${encodeURIComponent(process.env.PLANTNET_API_KEY!)}&nb-results=5&lang=en`;
      const j = await fetchJson<IdentifyResult>(url, { method: "POST", body: form, signal });
      return { bestMatch: j.bestMatch ?? null, results: (j.results ?? []).slice(0, 5) };
    },
    fallback: () => {
      const all = fixture<Record<string, IdentifyResult>>("plantnet_identify.json");
      const fx = structuredClone(all[demoPhoto ?? ""] ?? all.default);
      if (!all[demoPhoto ?? ""] && hint) {
        fx.results = [{ score: 0.74, species: { scientificNameWithoutAuthor: hint.scientific, commonNames: [hint.common] } }, ...fx.results].slice(0, 5);
        fx.bestMatch = hint.scientific;
      }
      return fx;
    },
  });
  return { identify: r.data, source: r.source };
}
