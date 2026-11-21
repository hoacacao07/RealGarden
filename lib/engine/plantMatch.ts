/**
 * Plant match: which plants (from Supabase's Plant table) fit what the user asked for.
 *   - garden types → plant groups ("vegetable" also brings kitchen herbs; "fruit" = fruit trees, shrubs and vines)
 *   - sun: the plant must list that sun (thrives) or the one next to it (tolerates); otherwise it's left out
 *   - zone (optional, from the ZIP): the plant must survive that USDA zone
 *   - invasive plants are never returned
 * Sorted: thrives before tolerates, then natives, then by name. Pure, tested.
 */
import { groupOf, isBlocked, isNative, zonesOf } from "../catalog";
import type { Light, Plant, PlantGroup } from "../types";
import { lightTerm } from "./recommend";

export type GardenType = "vegetable" | "fruit" | "herb" | "flower";
export const GARDEN_TYPES: GardenType[] = ["vegetable", "fruit", "herb", "flower"];

/** Which plant groups each garden type covers. */
export const TYPE_GROUPS: Record<GardenType, PlantGroup[]> = {
  vegetable: ["vegetable", "herb"],
  fruit: ["fruit"],
  herb: ["herb"],
  flower: ["flower"],
};

export const SUNS: Light[] = ["full_sun", "partial_shade", "full_shade"];

export interface MatchInput { types: GardenType[]; sun: Light; zone?: string | null }

export interface Match {
  plant: Plant;
  group: PlantGroup;
  fit: "thrives" | "tolerates";
  reason: string;
}

const SUN_WORDS: Record<Light, string> = { full_sun: "full sun", partial_shade: "some shade", full_shade: "mostly shade" };

export function matchPlants(plants: Plant[], input: MatchInput): Match[] {
  const groups = new Set(input.types.flatMap((t) => TYPE_GROUPS[t] ?? []));
  const out: Match[] = [];
  for (const p of plants) {
    if (isBlocked(p)) continue;
    const group = groupOf(p);
    if (!groups.has(group)) continue;
    const light = lightTerm(input.sun, p.light);
    if (light === 0) continue;
    if (input.zone && !zonesOf(p).includes(input.zone)) continue;
    const fit = light === 1 ? "thrives" : "tolerates";
    const reason = `${fit === "thrives" ? "Grows well in" : "Can handle"} ${SUN_WORDS[input.sun]}${input.zone ? `, survives zone ${input.zone}` : ""}`;
    out.push({ plant: p, group, fit, reason });
  }
  return out.sort((a, b) =>
    (a.fit === b.fit ? 0 : a.fit === "thrives" ? -1 : 1)
    || Number(isNative(b.plant)) - Number(isNative(a.plant))
    || a.plant.common_name.localeCompare(b.plant.common_name));
}
