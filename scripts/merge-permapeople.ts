/**
 * Step 2 of the Permapeople import (spec 6C.2). No keys, no network:
 *   npm run pp:merge
 *
 * Reads data/import_permapeople.json and data/import_review.csv (from `npm run pp:import`), and writes
 * data/permapeople_overlay.json: the generic fields to apply per plant. lib/catalog-data.ts applies the overlay, so
 * the next `npm run db:seed` writes the updated plants into Supabase's Plant table.
 * Review the overlay's git diff before committing; edit or delete any entry by hand.
 */
import fs from "node:fs";
import path from "node:path";

import { PLANTS_RAW } from "../lib/catalog-data";
import { buildOverlay, type ImportedPlant } from "../lib/engine/permapeople";

const DATA = path.join(process.cwd(), "data");
const IMPORT = path.join(DATA, "import_permapeople.json");
const REVIEW = path.join(DATA, "import_review.csv");
const OUT = path.join(DATA, "permapeople_overlay.json");

if (!fs.existsSync(IMPORT)) {
  console.error("No data/import_permapeople.json yet. Run `npm run pp:import` first (needs PP_KEY_ID and PP_KEY_SECRET in .env).");
  process.exit(1);
}
const imported = JSON.parse(fs.readFileSync(IMPORT, "utf8")) as Record<string, ImportedPlant>;
const review = fs.existsSync(REVIEW) ? fs.readFileSync(REVIEW, "utf8") : "plant_id,field,value,problem\n";

const { overlay, skipped } = buildOverlay(imported, review, PLANTS_RAW);
fs.writeFileSync(OUT, JSON.stringify(overlay, null, 2) + "\n");

const n = Object.keys(overlay.plants).length;
const fields = Object.values(overlay.plants).reduce((s, e) => s + Object.keys(e.fields).length, 0);
console.log(`Wrote data/permapeople_overlay.json: ${n} plants, ${fields} fields.`);
for (const s of skipped) console.log(`  skipped ${s.id}: ${s.why}`);
console.log("Next: check the diff (git diff data/permapeople_overlay.json), then `npm run db:seed` to update Supabase.");
