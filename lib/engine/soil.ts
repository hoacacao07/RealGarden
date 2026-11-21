/**
 * Soil helpers (Phase 10). Pure functions: turn a USDA Soil Data Access row into site soil facts,
 * classify texture and drainage into the app's simple categories, and produce plain-language tips.
 * Units: percentages 0..100, pH units, AWC cm/cm (= m/m of water per depth of soil).
 */
import type { Drainage, Plant, Region, Soil, SoilFacts } from "../types";

/** One SDA row with column names, values as strings (that's how SDA returns them). */
export type SdaRow = Record<string, string | null>;

/** Parse an SDA "JSON+COLUMNNAME" response: first row is the header. */
export function sdaRows(res: { Table?: (string | null)[][] } | null | undefined): SdaRow[] {
  const t = res?.Table;
  if (!t || t.length < 2) return [];
  const [head, ...rows] = t;
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [String(h), r[i] ?? null])));
}

const num = (v: string | null | undefined) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Survey row → soil facts. If the map unit is "Urban land" (built-up, often fill) or the key values are
 * missing, the source is "unknown": we keep whatever values exist as hints but don't trust them.
 */
export function factsFromSurvey(row: SdaRow | null): SoilFacts & { urban: boolean } {
  if (!row) return { soil_source: "unknown", urban: false };
  const name = row.muname ?? null;
  const urban = /urban land/i.test(name ?? "");
  const facts: SoilFacts = {
    survey_name: name, component: row.compname ?? null, drainage_class: row.drainagecl ?? null,
    sand_pct: num(row.sandtotal_r), clay_pct: num(row.claytotal_r), om_pct: num(row.om_r),
    ph: num(row.ph1to1h2o_r), awc: num(row.awc_r),
  };
  const missing = facts.sand_pct == null || facts.ph == null || facts.awc == null;
  return { ...facts, soil_source: urban || missing ? "unknown" : "survey", urban };
}

/** Texture class for the water model: organic matter > 20% is muck; then by sand %. */
export function soilTypeFrom(f: Pick<SoilFacts, "sand_pct" | "om_pct">, fallback: Soil = "sand"): Soil {
  if (f.om_pct != null && f.om_pct > 20) return "muck";
  if (f.sand_pct == null) return fallback;
  if (f.sand_pct >= 85) return "sand";
  if (f.sand_pct >= 65) return "sandy_loam";
  return "loam";
}

/** USDA drainage class text → fast / moderate / poor. */
export function drainageFrom(cls: string | null | undefined, fallback: Drainage = "moderate"): Drainage {
  if (!cls) return fallback;
  const c = cls.toLowerCase();
  if (c.includes("poorly")) return "poor";
  if (c.startsWith("moderately well")) return "moderate";
  if (c.includes("excessively") || c.startsWith("well")) return "fast";
  return fallback;
}

/** How far (pH units) the site pH is outside a plant's range; 0 when inside. */
export function phDistance(ph: number, range: [number, number]): number {
  if (ph < range[0]) return range[0] - ph;
  if (ph > range[1]) return ph - range[1];
  return 0;
}

/** Plants whose upper pH limit is below 7 struggle on alkaline (limestone) soil. */
export const isAcidLoving = (p: Pick<Plant, "ph_range">) => !!p.ph_range && p.ph_range[1] < 7;

/** South Florida limestone: region south with pH above 7.5. */
export const isLimestone = (region: Region, ph: number | null | undefined) => region === "south" && ph != null && ph > 7.5;

export const LOW_OM_PCT = 2;

export interface SoilTip { key: string; text: string }

/** 1 to 3 plain tips from the soil facts. */
export function soilTips(f: SoilFacts & { region: Region; urban?: boolean }): SoilTip[] {
  const tips: SoilTip[] = [];
  if (f.is_fill) tips.push({ key: "fill", text: "Fill dirt is often compacted. Loosen the top 6 to 8 in and work in compost before planting." });
  else if (f.urban || f.soil_source === "unknown") tips.push({ key: "unknown", text: "Built-up areas often have fill or mixed soil. A jar test and a pH kit tell you more than the survey can." });
  if (f.om_pct != null && f.om_pct < LOW_OM_PCT) tips.push({ key: "mulch", text: `Organic matter is low (${f.om_pct}%). Keep 2 to 3 in of mulch on the beds; it slowly builds the soil and holds water.` });
  if (isLimestone(f.region, f.ph)) tips.push({ key: "limestone", text: `pH ${f.ph} is typical of South Florida limestone. Acid-loving plants struggle here, so we rank them lower.` });
  else if (f.ph != null && f.ph < 5) tips.push({ key: "acid", text: `pH ${f.ph} is quite acidic. Most natives cope; vegetables may want a soil test first.` });
  return tips.slice(0, 3);
}
