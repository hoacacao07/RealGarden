/**
 * The full catalog from the JSON files, normalized (lib/catalog.ts): natives and non-natives (plants.json), edible
 * crops (edibles.json, origin "edible") and the Phase 11.6 additions (catalog_extra.json: fruit, roses and flowers,
 * more vegetables and herbs). Generic fields reviewed from Permapeople (data/permapeople_overlay.json, written by
 * `npm run pp:merge`) are applied on top. The seed writes these rows to Supabase; tests and scripts read them directly.
 */
import ediblesJson from "../data/edibles.json";
import extraJson from "../data/catalog_extra.json";
import overlayJson from "../data/permapeople_overlay.json";
import plantsJson from "../data/plants.json";
import { normalizePlant } from "./catalog";
import { applyOverlay, type Overlay } from "./engine/permapeople";
import type { Plant } from "./types";

type Raw = Parameters<typeof normalizePlant>[0];

/** Catalog records as the team wrote them, before the Permapeople overlay. */
export const PLANTS_RAW: Raw[] = [
  ...(plantsJson as unknown as Raw[]),
  ...(ediblesJson.plants as unknown as Raw[]),
  ...(extraJson.plants as unknown as Raw[]),
];

export const PLANTS: Plant[] = PLANTS_RAW.map((p) => normalizePlant(applyOverlay(p, overlayJson as unknown as Overlay)));
