/**
 * Permapeople → catalog (spec 6C.2). Pure functions, tested.
 *
 *   scripts/import-permapeople.ts  writes data/import_permapeople.json (raw generic fields) + data/import_review.csv
 *   scripts/merge-permapeople.ts   turns them into data/permapeople_overlay.json with buildOverlay()
 *   lib/catalog-data.ts            applies the overlay with applyOverlay() before the seed writes plants to Supabase
 *
 * Only GENERIC fields can come from Permapeople (OVERLAY_FIELDS). Florida fields (regions, zones, cold hardiness,
 * salt and wind tolerance, chill hours, fl_notes) always come from the team's sheet, so applyOverlay ignores anything
 * else even if someone edits the overlay by hand. Data is CC BY-SA 4.0: the credit line is on plant pages and the footer.
 */
import type { Level, Light, Plant } from "../types";

/** One plant as written by scripts/import-permapeople.ts. */
export interface ImportedPlant {
  permapeople_id: number;
  matched?: string | null;
  light?: string | null;
  water?: string | null;
  soil?: string | null;
  ph?: string | null;
  height_ft?: [number, number] | null;
  width_ft?: [number, number] | null;
  life_cycle?: string | null;
  layer?: string | null;
  growth?: string | null;
  propagation?: string | null;
  edible_parts?: string | null;
}

export const OVERLAY_FIELDS = ["mature_height_ft", "mature_spread_ft", "light", "water_need", "ph_range", "life_cycle", "growth_rate"] as const;
export type OverlayField = (typeof OVERLAY_FIELDS)[number];
export type OverlayPatch = Partial<Pick<Plant, OverlayField>>;

export interface OverlayEntry { permapeople_id: number; matched: string | null; fields: OverlayPatch }
export interface Overlay { _note?: string; generated_at?: string | null; plants: Record<string, OverlayEntry> }

/** Review CSV field names (import script) → catalog field they block. */
const REVIEW_FIELD: Record<string, OverlayField> = { height_ft: "mature_height_ft", width_ft: "mature_spread_ft" };

/* ---------- value mapping ---------- */

/** "Full sun, partial sun/shade" → ["full_sun", "partial_shade"]. Unknown text → null (keep the catalog value). */
export function mapLight(v: string | null | undefined): Light[] | null {
  if (!v) return null;
  const s = v.toLowerCase();
  const out: Light[] = [];
  if (/full sun|^sun\b/.test(s)) out.push("full_sun");
  if (/partial|part[ -]|semi|light shade|dappled/.test(s)) out.push("partial_shade");
  if (/full shade|deep shade|^shade|, ?shade/.test(s)) out.push("full_shade");
  return out.length ? out : null;
}

/** "Dry" → low, "Moist" → medium, "Wet" → high. A range ("Dry, moist") takes the driest: the plant tolerates it. */
export function mapWater(v: string | null | undefined): Level | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (/dry|drought/.test(s)) return "low";
  if (/moist|average|medium|moderate/.test(s)) return "medium";
  if (/wet|aquatic|bog|water/.test(s)) return "high";
  return null;
}

/** "5.5-7.0" or "6 - 7.5" → [5.5, 7]. Outside 3..10 → null. */
export function mapPh(v: string | null | undefined): [number, number] | null {
  if (!v) return null;
  const n = (v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!n.length) return null;
  const r: [number, number] = [Math.min(...n), Math.max(...n)];
  return r[0] >= 3 && r[1] <= 10 ? r : null;
}

export function mapLifeCycle(v: string | null | undefined): Plant["life_cycle"] | null {
  const s = v?.toLowerCase() ?? "";
  // "Perennial grown as annual" is an annual in a Florida garden plan.
  if (/annual/.test(s)) return "annual";
  if (/biennial/.test(s)) return "biennial";
  if (/perennial/.test(s)) return "perennial";
  return null;
}

export function mapGrowth(v: string | null | undefined): Plant["growth_rate"] | null {
  const s = v?.toLowerCase() ?? "";
  if (/slow/.test(s)) return "slow";
  if (/fast|rapid/.test(s)) return "fast";
  if (/medium|moderate/.test(s)) return "medium";
  return null;
}

/** [lo, hi] feet, both > 0, sorted. */
function size(v: [number, number] | null | undefined): [number, number] | null {
  if (!v || v.length !== 2 || !(v[0] > 0) || !(v[1] > 0)) return null;
  return v[0] <= v[1] ? [v[0], v[1]] : [v[1], v[0]];
}

/** Same genus? A search hit for a different genus is a wrong match, not data. */
export function sameGenus(a: string | null | undefined, b: string): boolean {
  const g = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return !!a && g(a) === g(b);
}

/** Generic fields for one plant. Fields the review CSV flagged are left out. */
export function patchFor(imp: ImportedPlant, blocked: Set<OverlayField> = new Set()): OverlayPatch {
  const p: OverlayPatch = {};
  const set = <K extends OverlayField>(k: K, v: OverlayPatch[K] | null) => { if (v != null && !blocked.has(k)) p[k] = v; };
  set("mature_height_ft", size(imp.height_ft));
  set("mature_spread_ft", size(imp.width_ft));
  set("light", mapLight(imp.light));
  set("water_need", mapWater(imp.water));
  set("ph_range", mapPh(imp.ph));
  set("life_cycle", mapLifeCycle(imp.life_cycle));
  set("growth_rate", mapGrowth(imp.growth));
  return p;
}

/** Parse data/import_review.csv ("plant_id,field,value,problem") into blocked fields per plant. */
export function parseReview(csv: string): Map<string, Set<OverlayField>> {
  const out = new Map<string, Set<OverlayField>>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [id, field] = line.split(",");
    const f = REVIEW_FIELD[field?.trim() ?? ""];
    if (!id || !f) continue;
    out.set(id, (out.get(id) ?? new Set()).add(f));
  }
  return out;
}

export interface BuildResult { overlay: Overlay; skipped: { id: string; why: string }[] }

/**
 * Overlay from the import, the review file and the catalog. Skips plants that are no longer in the catalog, hits from a
 * different genus (wrong match) and plants with nothing usable.
 */
export function buildOverlay(
  imported: Record<string, ImportedPlant>, reviewCsv: string, catalog: Pick<Plant, "id" | "scientific_name">[], now = new Date().toISOString(),
): BuildResult {
  const review = parseReview(reviewCsv);
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const plants: Overlay["plants"] = {};
  const skipped: BuildResult["skipped"] = [];
  for (const [id, imp] of Object.entries(imported)) {
    const cat = byId.get(id);
    if (!cat) { skipped.push({ id, why: "not in the catalog any more" }); continue; }
    if (!sameGenus(imp.matched, cat.scientific_name)) { skipped.push({ id, why: `matched ${imp.matched ?? "nothing"}, not ${cat.scientific_name}` }); continue; }
    const fields = patchFor(imp, review.get(id));
    if (!Object.keys(fields).length) { skipped.push({ id, why: "no usable fields" }); continue; }
    plants[id] = { permapeople_id: imp.permapeople_id, matched: imp.matched ?? null, fields };
  }
  return {
    overlay: {
      _note: "Generated by `npm run pp:merge` from data/import_permapeople.json. Review the diff before committing; edit or delete entries freely. Only generic fields are applied (lib/engine/permapeople.ts OVERLAY_FIELDS). Data from Permapeople.org, CC BY-SA 4.0.",
      generated_at: now, plants,
    },
    skipped,
  };
}

/** Apply one plant's overlay entry. Only OVERLAY_FIELDS are copied; the Permapeople id is kept for attribution. */
export function applyOverlay<T extends { id: string }>(raw: T, overlay: Overlay | null | undefined): T & { permapeople_id?: number } {
  const e = overlay?.plants?.[raw.id];
  if (!e) return raw;
  const patch: Record<string, unknown> = {};
  for (const k of OVERLAY_FIELDS) if (e.fields?.[k] != null) patch[k] = e.fields[k];
  return { ...raw, ...patch, permapeople_id: e.permapeople_id };
}
