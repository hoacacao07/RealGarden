/**
 * Plant recommender.
 * S = 0.30·light + 0.25·salt + 0.20·water + 0.15·region + 0.10·space   (each term 0..1)
 * Hard filters set S = 0: not native to the region, salt-sensitive within 0.5 mi of the coast,
 * too big for the space, invasive. +0.1 (cap 1) when the plant matches the chosen theme.
 * Soil pH (Phase 10, only when the soil source is trusted: survey, user or lab): more than 0.5 outside the
 * plant's range → excluded; up to 0.5 outside → −0.1 with a reason. South Florida limestone (pH > 7.5) → −0.1
 * for acid-loving plants.
 * Balcony mode (Phase 11.5, site.kind = "balcony"): light comes from the sun hours engine (stored as site.sun);
 * plants that can't live in a pot are filtered; floor 4+ lowers low-wind-tolerance plants by 0.15, floor 10+ filters
 * them; the yard-size filter and soil pH don't apply (pots hold potting mix); the salt filter stays.
 */
import type { Light, Plant, Region, SiteInput, Theme } from "../types";
import { median, POT_TOP_FT, RAILING_D_FT, sunStrip } from "./balconySun";
import { isAcidLoving, isLimestone, phDistance } from "./soil";

const LEVEL = { low: 0, medium: 1, high: 2 } as const;
const LIGHT_ORDER: Light[] = ["full_sun", "partial_shade", "full_shade"];

export type Badge = "native_here" | "florida_native" | "non_native" | "edible" | "invasive";

export interface Scored {
  plant: Plant;
  score: number; // 0..1
  terms: { light: number; salt: number; water: number; region: number; space: number };
  reasons: string[];
  excluded: string | null;
  badge: Badge;
}

export function badgeFor(p: Plant, region: Region): Badge {
  if (p.invasive_status === "invasive") return "invasive";
  if (p.origin === "edible") return "edible";
  if (p.origin !== "native") return "non_native";
  return p.regions.includes(region) ? "native_here" : "florida_native";
}

export const BADGE_LABEL: Record<Badge, string> = {
  native_here: "Native to your area",
  florida_native: "Florida native",
  non_native: "Non-native",
  edible: "Edible",
  invasive: "Invasive",
};

/** 1 if the site's sun is in the plant's list, 0.5 if one step away, else 0. */
export function lightTerm(sun: Light, plantLight: Light[]): number {
  if (plantLight.includes(sun)) return 1;
  const i = LIGHT_ORDER.indexOf(sun);
  return plantLight.some((l) => Math.abs(LIGHT_ORDER.indexOf(l) - i) === 1) ? 0.5 : 0;
}

/** Salt demand falls with distance from the coast (mi): <1 needs high, 1–3 prefers medium+, >3 anything. */
export function saltTerm(coastMi: number, tol: Plant["salt_tolerance"]): number {
  const l = LEVEL[tol];
  if (coastMi < 1) return [0, 0.5, 1][l];
  if (coastMi < 3) return [0.5, 1, 1][l];
  return 1;
}

/** Reward low water need on fast-draining sand; high need only fits wet sites or the water theme. */
export function waterTerm(site: Pick<SiteInput, "soil" | "drainage">, need: Plant["water_need"], theme: Theme | null): number {
  const wetOk = site.drainage === "poor" || theme === "water" || site.soil === "muck";
  const dry = site.drainage === "fast" || site.soil === "sand";
  if (need === "low") return dry ? 1 : 0.8;
  if (need === "medium") return dry ? 0.6 : 0.9;
  if (wetOk) return 1;
  return dry ? 0.1 : 0.3;
}

/** Pots are watered by hand whatever the ground soil is; thirstier plants just mean more trips (balconies). */
export const POT_WATER: Record<Plant["water_need"], number> = { low: 1, medium: 0.9, high: 0.7 };

/** Mean mature canopy area (sq ft) as a share of the yard: ≤10% → 1, ≤30% → 0.7, ≤60% → 0.4, else 0.2. */
export function spaceTerm(areaSqft: number, spread: [number, number]): number {
  if (areaSqft <= 0) return 0;
  const r = (spread[0] + spread[1]) / 4;
  const frac = (Math.PI * r * r) / areaSqft;
  if (frac <= 0.1) return 1;
  if (frac <= 0.3) return 0.7;
  if (frac <= 0.6) return 0.4;
  return 0.2;
}

const human = (s: string) => s.replace(/_/g, " ");

/** Site pH only when it comes from a source we trust (not "unknown", e.g. Urban land survey units). */
export function trustedPh(site: Pick<SiteInput, "ph" | "soil_source">): number | null {
  return site.ph != null && site.soil_source && site.soil_source !== "unknown" ? site.ph : null;
}

/**
 * railHours (balconies): median direct sun hours for a pot at the railing, the sunniest spot. A sun lover that gets
 * 5+ h there scores 0.85 on light instead of 0.5, with "put it at the railing" as its reason.
 */
export function scorePlant(site: SiteInput, p: Plant, theme: Theme | null = null, railHours: number | null = null): Scored {
  const atRail = site.kind === "balcony" && railHours != null && railHours >= 5 && site.sun !== "full_sun" && p.light.includes("full_sun") && lightTerm(site.sun, p.light) < 1;
  const terms = {
    light: atRail ? 0.85 : lightTerm(site.sun, p.light),
    salt: saltTerm(site.coastal_distance_mi, p.salt_tolerance),
    water: site.kind === "balcony" ? POT_WATER[p.water_need] : waterTerm(site, p.water_need, theme),
    region: p.regions.includes(site.region) ? 1 : 0,
    space: site.kind === "balcony" ? 1 : spaceTerm(site.area_sqft, p.mature_spread_ft),
  };
  const balcony = site.kind === "balcony";
  const floor = site.floor_level ?? 1;
  const badge = badgeFor(p, site.region);
  const out = (excluded: string): Scored => ({ plant: p, score: 0, terms, reasons: [], excluded, badge });

  if (p.invasive_status === "invasive") return out("Invasive in Florida");
  // Non-natives are never "native to the region"; region applies to natives only.
  if (p.origin === "native" && !p.regions.includes(site.region)) return out(`Not native to ${site.region} Florida`);
  if (site.coastal_distance_mi < 0.5 && p.salt_tolerance === "low") return out("Salt-sensitive this close to the coast");
  if (balcony && !p.container_ok) return out("Doesn't do well in a pot");
  if (balcony && floor >= 10 && p.wind_tolerance === "low") return out("Too windy for it this high up");
  const maxR = p.mature_spread_ft[1] / 2;
  if (!balcony && Math.PI * maxR * maxR > site.area_sqft) return out("Too big for this space at maturity");
  const ph = balcony ? null : trustedPh(site);
  const phOff = ph != null && p.ph_range ? phDistance(ph, p.ph_range) : 0;
  if (phOff > 0.5) return out(`Soil pH ${ph} is outside its range (${p.ph_range[0]} to ${p.ph_range[1]})`);

  let s = 0.3 * terms.light + 0.25 * terms.salt + 0.2 * terms.water + 0.15 * terms.region + 0.1 * terms.space;
  const reasons: string[] = [];
  const soilReasons: string[] = [];
  if (phOff > 0) {
    s -= 0.1;
    soilReasons.push(`Soil pH ${ph} is at the edge of its range`);
  }
  if (isLimestone(site.region, ph) && isAcidLoving(p)) {
    s -= 0.1;
    soilReasons.push("Prefers acid soil; limestone may yellow its leaves");
  }
  if (balcony && floor >= 4 && p.wind_tolerance === "low") {
    s -= 0.15;
    soilReasons.push("Wind gets strong this high up; give it a sheltered corner");
  }
  s = Math.max(0.01, s);
  if (theme && p.garden_themes.includes(theme)) {
    s = Math.min(1, s + 0.1);
    reasons.push(`Fits your ${theme} theme`);
  }
  if (balcony && p.origin === "native" && p.wildlife_value.some((w) => w === "butterflies" || w === "bees")) reasons.push("A pot of it brings pollinators to your edibles");
  if (atRail) reasons.push(`About ${Math.round(railHours! * 2) / 2} h of sun at the railing: put it there`);
  if (terms.light === 1) reasons.push(`Thrives in ${human(site.sun)}`);
  else if (terms.light === 0.5) reasons.push(`Tolerates ${human(site.sun)}`);
  if (p.salt_tolerance === "high" && site.coastal_distance_mi < 3) reasons.push("Handles salt spray near the bay");
  if (p.water_need === "low" && terms.water >= 0.8) reasons.push(`Low water once established in ${human(site.soil)}`);
  if (p.host_plant_for.length) reasons.push(`Host plant for ${p.host_plant_for.slice(0, 2).join(" and ")}`);
  if (terms.space < 0.5) reasons.push("Gets big for this yard, place with care");
  // Soil warnings come first so they are never cut by the 2-reason limit.
  return { plant: p, score: Math.round(s * 1000) / 1000, terms, reasons: [...soilReasons, ...reasons].slice(0, 2), excluded: null, badge };
}

export interface Recommendations {
  natives: Scored[]; // native to the region, ranked
  nonNatives: Scored[]; // non-invasive non-natives, ranked (shown collapsed)
  edibles: Scored[]; // Phase 11: vegetables and herbs for the edible zone, ranked (never count toward native %)
}

/** Natives first, non-natives collapsed, edibles separate, invasives never. */
export function recommend(site: SiteInput, plants: Plant[], theme: Theme | null = null): Recommendations {
  const rail = site.kind === "balcony" ? median(sunStrip(site.lat, site.lon, site, RAILING_D_FT, POT_TOP_FT.railing)) : null;
  const scored = plants.map((p) => scorePlant(site, p, theme, rail)).filter((s) => s.score > 0);
  const rank = (a: Scored, b: Scored) => b.score - a.score || a.plant.common_name.localeCompare(b.plant.common_name);
  return {
    natives: scored.filter((s) => s.plant.origin === "native").sort(rank),
    nonNatives: scored.filter((s) => s.plant.origin === "non_native").sort(rank),
    edibles: scored.filter((s) => s.plant.origin === "edible").sort(rank),
  };
}

/** Native swap: for a non-native, the native alternatives with a one-line pitch. */
export function nativeSwap(p: Plant, all: Plant[]): { plant: Plant; alternatives: Plant[]; message: string } | null {
  if (p.origin === "native") return null;
  const alts = p.native_alternatives.map((id) => all.find((x) => x.id === id)).filter((x): x is Plant => !!x);
  if (!alts.length) return null;
  const first = alts[0];
  const color = first.flower_colors[0]?.name ?? "look";
  const status = p.invasive_status === "invasive" ? "is invasive in Florida" : "is not native to Florida";
  const name = p.common_name.split(" ").map((w, i) => (i === 0 ? w : w.toLowerCase())).join(" ");
  return { plant: p, alternatives: alts, message: `${name} ${status}. Try ${first.common_name.toLowerCase()} for the same ${color}.` };
}
