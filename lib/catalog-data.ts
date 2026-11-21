/**
 * The full catalog from the JSON files, normalized (lib/catalog.ts): natives and non-natives (plants.json), edible
 * crops (edibles.json, origin "edible") and the Phase 11.6 additions (catalog_extra.json: fruit, roses and flowers,
 * more vegetables and herbs). The seed writes these rows; tests and scripts read them directly.
 */
import ediblesJson from "../data/edibles.json";
import extraJson from "../data/catalog_extra.json";
import plantsJson from "../data/plants.json";
import { normalizePlant } from "./catalog";
import type { Plant } from "./types";

type Raw = Parameters<typeof normalizePlant>[0];

export const PLANTS: Plant[] = [
  ...(plantsJson as unknown as Raw[]),
  ...(ediblesJson.plants as unknown as Raw[]),
  ...(extraJson.plants as unknown as Raw[]),
].map(normalizePlant);
