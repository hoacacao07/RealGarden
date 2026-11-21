/** Minimal request validation for the public garden API (no auth, so keep inputs sane). */
import type { GardenSave } from "./data";
import { regionForLat } from "./engine/geo";
import type { BalconyFacts, BalconyRules, Goal, PlacementInput, SiteInput, SoilFacts, StarterAnswers, ZoneInput } from "./types";

export class BadRequest extends Error {}

const num = (v: unknown, name: string, lo: number, hi: number) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new BadRequest(`${name} must be a number between ${lo} and ${hi}`);
  return n;
};
const oneOf = <T extends string>(v: unknown, name: string, opts: readonly T[]): T => {
  if (!opts.includes(v as T)) throw new BadRequest(`${name} must be one of ${opts.join(", ")}`);
  return v as T;
};
const str = (v: unknown, name: string, max = 120) => {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`${name} is required`);
  return v.trim().slice(0, max);
};
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10));

export function parseSite(v: unknown): SiteInput {
  const s = (v ?? {}) as Record<string, unknown>;
  const lat = num(s.lat, "lat", 24, 31.5);
  return {
    name: typeof s.name === "string" ? s.name.slice(0, 120) : undefined,
    lat, lon: num(s.lon, "lon", -88, -79.5),
    zip: typeof s.zip === "string" ? s.zip.slice(0, 5) : null,
    region: regionForLat(lat),
    sun: oneOf(s.sun, "sun", ["full_sun", "partial_shade", "full_shade"] as const),
    soil: oneOf(s.soil, "soil", ["sand", "sandy_loam", "loam", "muck"] as const),
    drainage: oneOf(s.drainage, "drainage", ["poor", "moderate", "fast"] as const),
    coastal_distance_mi: num(s.coastal_distance_mi, "coastal_distance_mi", 0, 200),
    area_sqft: num(s.area_sqft, "area_sqft", 20, 50000),
    native_target_pct: s.native_target_pct == null || s.native_target_pct === "" ? null : num(s.native_target_pct, "native_target_pct", 0, 100),
    ...parseSoil(s),
    ...parseBalcony(s),
  };
}

const triState = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Phase 11.5 balcony profile. Only kept when kind = balcony. */
export function parseBalcony(s: Record<string, unknown>): BalconyFacts {
  if (s.kind !== "balcony") return { kind: "yard" };
  const r = (s.rules ?? {}) as Record<string, unknown>;
  const rules: BalconyRules = { railing_pots: triState(r.railing_pots), hanging_baskets: triState(r.hanging_baskets), no_drip: triState(r.no_drip) };
  return {
    kind: "balcony",
    facing_deg: num(s.facing_deg, "facing_deg", 0, 359.9),
    floor_level: Math.round(num(s.floor_level ?? 1, "floor_level", 1, 120)),
    balcony_l_ft: num(s.balcony_l_ft, "balcony_l_ft", 2, 60), balcony_w_ft: num(s.balcony_w_ft, "balcony_w_ft", 2, 30),
    railing_ft: optNum(s.railing_ft, "railing_ft", 0, 120),
    overhang_depth_ft: optNum(s.overhang_depth_ft, "overhang_depth_ft", 0, 30), overhang_height_ft: optNum(s.overhang_height_ft, "overhang_height_ft", 1, 30),
    rules,
  };
}

const optNum = (v: unknown, name: string, lo: number, hi: number) => (v == null || v === "" ? null : num(v, name, lo, hi));
const optStr = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Phase 10 soil facts. All optional; unknown source by default. */
export function parseSoil(s: Record<string, unknown>): SoilFacts {
  return {
    soil_source: s.soil_source == null ? "unknown" : oneOf(s.soil_source, "soil_source", ["survey", "user", "lab", "unknown"] as const),
    survey_name: optStr(s.survey_name), component: optStr(s.component, 80), drainage_class: optStr(s.drainage_class, 60),
    sand_pct: optNum(s.sand_pct, "sand_pct", 0, 100), clay_pct: optNum(s.clay_pct, "clay_pct", 0, 100),
    om_pct: optNum(s.om_pct, "om_pct", 0, 100), ph: optNum(s.ph, "ph", 3, 10), awc: optNum(s.awc, "awc", 0, 0.6),
    is_fill: typeof s.is_fill === "boolean" ? s.is_fill : null,
  };
}

export function parseLayout(body: Record<string, unknown>, w: number, h: number): { zones: ZoneInput[]; placements: PlacementInput[] } {
  const zones = Array.isArray(body.zones) ? body.zones.slice(0, 12) : [];
  const placements = Array.isArray(body.placements) ? body.placements.slice(0, 600) : [];
  return {
    zones: zones.map((z: Record<string, unknown>, i: number) => ({
      id: typeof z.id === "string" ? z.id.slice(0, 40) : undefined,
      name: str(z.name ?? `Zone ${i + 1}`, "zone name", 60),
      irrigation: oneOf(z.irrigation, "irrigation", ["none", "drip", "spray"] as const),
      kind: z.kind == null ? "landscape" : oneOf(z.kind, "zone kind", ["landscape", "edible"] as const),
      bed: z.bed == null ? null : oneOf(z.bed, "bed", ["in_ground", "raised", "container"] as const),
      depth_in: optNum(z.depth_in, "depth_in", 1, 48),
      polygon: (Array.isArray(z.polygon) ? z.polygon : []).slice(0, 40).map((pt: unknown) => {
        const [x, y] = pt as [unknown, unknown];
        return [num(x, "x", -1, w + 1), num(y, "y", -1, h + 1)] as [number, number];
      }),
    })).filter((z) => z.polygon.length >= 3),
    placements: placements.map((p: Record<string, unknown>) => ({
      plant_id: str(p.plant_id, "plant_id", 60),
      zone_id: typeof p.zone_id === "string" ? p.zone_id : null,
      x_ft: num(p.x_ft, "x_ft", 0, w), y_ft: num(p.y_ft, "y_ft", 0, h),
      group_id: typeof p.group_id === "string" ? p.group_id.slice(0, 40) : null,
      planted_on: isoDate(p.planted_on),
      container_gal: optNum(p.container_gal, "container_gal", 0.25, 100),
      mount: p.mount == null ? null : oneOf(p.mount, "mount", ["floor", "railing", "hanging"] as const),
    })),
  };
}

const GOALS: Goal[] = ["flowers", "food", "butterflies", "low_care"];

/** Phase 11 starter answers. Everything optional. */
export function parseStarter(v: unknown): StarterAnswers | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const s = v as Record<string, unknown>;
  return {
    goals: (Array.isArray(s.goals) ? s.goals : []).filter((g): g is Goal => GOALS.includes(g as Goal)),
    hours_week: s.hours_week == null ? null : oneOf(s.hours_week, "hours_week", ["1", "2-4", "5+"] as const),
    budget_usd: optNum(s.budget_usd, "budget_usd", 0, 1_000_000),
    space: s.space == null ? null : oneOf(s.space, "space", ["yard", "raised_bed", "containers", "balcony", "patio"] as const),
    target_harvest: typeof s.target_harvest === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.target_harvest) ? s.target_harvest : null,
  };
}

export function parseGarden(v: unknown, plantIds: Set<string>): GardenSave {
  const b = (v ?? {}) as Record<string, unknown>;
  // Balconies can be small (min 2 ft); yard canvases start at 16 ft.
  const w = num(b.canvas_w_ft, "canvas_w_ft", 2, 200);
  const h = num(b.canvas_h_ft, "canvas_h_ft", 2, 200);
  const layout = parseLayout(b, w, h);
  const unknown = layout.placements.find((p) => !plantIds.has(p.plant_id));
  if (unknown) throw new BadRequest(`Unknown plant ${unknown.plant_id}`);
  return {
    name: str(b.name ?? "My native garden", "name"),
    theme: b.theme == null ? null : oneOf(b.theme, "theme", ["seaside", "water", "wildlife"] as const),
    planted_on: isoDate(b.planted_on),
    canvas_w_ft: w, canvas_h_ft: h,
    site: parseSite(b.site),
    starter: parseStarter(b.starter),
    ...layout,
  };
}
