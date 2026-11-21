/**
 * Offline import from Permapeople (spec 6C.2). Run once by a teammate, never by the app:
 *   npm run pp:import        (PP_KEY_ID and PP_KEY_SECRET in .env)
 *
 * For each plant in our catalog it searches Permapeople by scientific name and pulls GENERIC fields only (light,
 * water, soil, pH, height, width, life cycle, layer, growth, propagation, edible parts). Florida fields (regions,
 * zones, chill hours, cold hardiness, salt and wind tolerance, fl_notes) always come from the team's sheet, never
 * from here.
 *
 * Output (for a human to review; then `npm run pp:merge` builds data/permapeople_overlay.json):
 *   data/import_permapeople.json   normalized generic fields per plant id
 *   data/import_review.csv         outliers and unit problems to fix by hand
 * Data is CC BY-SA 4.0 (non-commercial): credit "Plant data partly from Permapeople.org (CC BY-SA 4.0)" and keep
 * data/plants.json derived from it under the same license.
 *
 * API details (base URL, header names) follow Permapeople's public API docs; check them before running.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { groupOf } from "../lib/catalog";
import { PLANTS } from "../lib/catalog-data";
import type { PlantGroup } from "../lib/types";

const BASE = "https://permapeople.org/api";
const KEY_ID = process.env.PP_KEY_ID;
const KEY_SECRET = process.env.PP_KEY_SECRET;

/** Plausible mature size (ft) per group; anything outside is flagged, not silently fixed. */
const SIZE_FT: Record<PlantGroup, { h: [number, number]; w: [number, number] }> = {
  vegetable: { h: [0.2, 10], w: [0.2, 12] },
  herb: { h: [0.2, 8], w: [0.2, 6] },
  fruit: { h: [0.5, 60], w: [0.5, 50] },
  flower: { h: [0.2, 15], w: [0.2, 15] },
  shrub_tree: { h: [0.5, 100], w: [0.5, 80] },
};

interface PpPlant { id: number; scientific_name?: string; name?: string; data?: { key: string; value: string }[] }

async function search(q: string): Promise<PpPlant[]> {
  const r = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-permapeople-key-id": KEY_ID!, "x-permapeople-key-secret": KEY_SECRET! },
    body: JSON.stringify({ q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = (await r.json()) as { plants?: PpPlant[] };
  return j.plants ?? [];
}

const field = (p: PpPlant, ...keys: string[]) => p.data?.find((d) => keys.some((k) => d.key.toLowerCase() === k.toLowerCase()))?.value ?? null;

/** "1-2", "0.5 - 1.5", "8" with a unit hint in the key ("Height (m)") → feet [min, max]. */
export function toFeet(raw: string | null, unitKey: string): [number, number] | null {
  if (!raw) return null;
  const nums = raw.match(/\d+(\.\d+)?/g)?.map(Number);
  if (!nums?.length) return null;
  const k = /\(m\)|meter|metre/i.test(unitKey) || /\bm\b/.test(raw) ? 3.281 : /\bcm\b/i.test(raw) ? 0.03281 : 1;
  const lo = nums[0] * k;
  const hi = (nums[1] ?? nums[0]) * k;
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}

async function main() {
  if (!KEY_ID || !KEY_SECRET) {
    console.error("Set PP_KEY_ID and PP_KEY_SECRET (Permapeople API keys) in .env first.");
    process.exit(1);
  }
  const out: Record<string, unknown> = {};
  const review: string[] = ["plant_id,field,value,problem"];
  for (const plant of PLANTS) {
    let hits: PpPlant[] = [];
    try {
      hits = await search(plant.scientific_name.replace(/['"]/g, "").split(" ").slice(0, 2).join(" "));
    } catch (e) {
      review.push(`${plant.id},search,,${JSON.stringify((e as Error).message)}`);
      continue;
    }
    const hit = hits.find((h) => h.scientific_name?.toLowerCase() === plant.scientific_name.toLowerCase()) ?? hits[0];
    if (!hit) { review.push(`${plant.id},search,,no match`); continue; }
    const hKey = hit.data?.find((d) => /height/i.test(d.key))?.key ?? "Height";
    const wKey = hit.data?.find((d) => /width|spread/i.test(d.key))?.key ?? "Width";
    const height = toFeet(field(hit, hKey), hKey);
    const width = toFeet(field(hit, wKey), wKey);
    const lim = SIZE_FT[groupOf(plant)];
    // Sanity checks: units in the source can be inconsistent (e.g. a squash with width 8 under "Width (m)").
    if (height && (height[1] < lim.h[0] || height[1] > lim.h[1])) review.push(`${plant.id},height_ft,${height.join("-")},outside ${lim.h.join("-")} ft for ${groupOf(plant)}`);
    if (width && (width[1] < lim.w[0] || width[1] > lim.w[1])) review.push(`${plant.id},width_ft,${width.join("-")},outside ${lim.w.join("-")} ft for ${groupOf(plant)}`);
    out[plant.id] = {
      permapeople_id: hit.id, matched: hit.scientific_name,
      light: field(hit, "Light requirement"), water: field(hit, "Water requirement"), soil: field(hit, "Soil type"),
      ph: field(hit, "Soil pH"), height_ft: height, width_ft: width, life_cycle: field(hit, "Life cycle"), layer: field(hit, "Layer"),
      growth: field(hit, "Growth"), propagation: field(hit, "Propagation"), edible_parts: field(hit, "Edible parts"),
      license: "CC BY-SA 4.0, permapeople.org",
    };
    await new Promise((r) => setTimeout(r, 300)); // be polite
  }
  fs.writeFileSync(path.join("data", "import_permapeople.json"), JSON.stringify(out, null, 2) + "\n");
  fs.writeFileSync(path.join("data", "import_review.csv"), review.join("\n") + "\n");
  console.log(`Imported ${Object.keys(out).length} of ${PLANTS.length}. ${review.length - 1} rows to review in data/import_review.csv.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
