/**
 * Soil plan (Phase 11): what to do with the soil in each zone, with 1 or 2 reasons.
 * Native (landscape) zone: use the existing soil, mulch 2 to 3 in, no fertilizer. Fill dirt or compacted
 *   (poorly drained) soil → loosen and add organic matter.
 * Edible zone:
 *   containers                                                   → potting mix
 *   pH outside 5.5–7.0, fill dirt, unknown + very sandy soil, or
 *   South Florida limestone                                      → raised bed
 *   otherwise                                                    → in-ground with 1 to 4 in of compost worked in
 */
import type { BedType, Region, SiteInput, Space, ZoneKind } from "../types";
import { trustedPh } from "./recommend";
import { isLimestone } from "./soil";

export type SoilDecision = "use_existing" | "loosen_amend" | "in_ground_compost" | "raised_bed" | "potting_mix";

export interface SoilPlan {
  zone_kind: ZoneKind;
  decision: SoilDecision;
  bed: BedType;
  title: string;
  reasons: string[];
}

export const EDIBLE_PH: [number, number] = [5.5, 7.0];
/** Sand % above which an unknown (often fill or built-up) soil counts as "very sandy". */
export const VERY_SANDY_PCT = 90;

type SoilSite = Pick<SiteInput, "soil" | "drainage" | "ph" | "soil_source" | "sand_pct" | "is_fill" | "region"> & { region: Region };

export function nativeSoilPlan(site: SoilSite): SoilPlan {
  const compacted = site.drainage === "poor" && site.soil !== "muck";
  if (site.is_fill || compacted) {
    return {
      zone_kind: "landscape", decision: "loosen_amend", bed: "in_ground", title: "Loosen the soil and add organic matter",
      reasons: [
        site.is_fill ? "Built on fill dirt, which is usually compacted" : "Water puddles, a sign of compacted soil",
        "Loosen the top 6 to 8 in, work in 2 in of compost, then mulch 2 to 3 in. No fertilizer needed for natives.",
      ],
    };
  }
  return {
    zone_kind: "landscape", decision: "use_existing", bed: "in_ground", title: "Use your existing soil",
    reasons: ["Florida natives are adapted to local soil", "Mulch 2 to 3 in to hold water. No fertilizer by default."],
  };
}

export function edibleSoilPlan(site: SoilSite, opts: { containers?: boolean } = {}): SoilPlan {
  if (opts.containers) {
    return {
      zone_kind: "edible", decision: "potting_mix", bed: "container", title: "Fill containers with potting mix",
      reasons: ["Garden soil packs down in pots and drains poorly", "Use a bagged potting mix, never soil from the ground"],
    };
  }
  const ph = trustedPh(site);
  const reasons: string[] = [];
  if (ph != null && (ph < EDIBLE_PH[0] || ph > EDIBLE_PH[1])) reasons.push(`Soil pH ${ph} is outside the 5.5 to 7.0 most vegetables need`);
  if (isLimestone(site.region, site.ph)) reasons.push("South Florida limestone is too alkaline for most vegetables");
  if (site.is_fill) reasons.push("Fill dirt can be compacted and of unknown quality");
  if (site.soil_source === "unknown" && site.sand_pct != null && site.sand_pct >= VERY_SANDY_PCT)
    reasons.push(`Very sandy soil (${site.sand_pct}% sand) on built-up land with no reliable survey`);
  if (reasons.length) {
    return { zone_kind: "edible", decision: "raised_bed", bed: "raised", title: "Build a raised bed", reasons: [...new Set(reasons)].slice(0, 2) };
  }
  return {
    zone_kind: "edible", decision: "in_ground_compost", bed: "in_ground", title: "Plant in the ground with compost",
    reasons: [ph != null ? `Soil pH ${ph} suits vegetables` : "Your soil looks workable for vegetables", "Work 1 to 4 in of compost into the top 6 in before planting"],
  };
}

export const CONTAINER_SPACES: Space[] = ["containers", "balcony", "patio"];

/** Plan for every zone kind present (landscape always; edible when there is an edible zone). */
export function soilPlan(site: SoilSite, zoneKinds: ZoneKind[], space: Space | null): SoilPlan[] {
  const out: SoilPlan[] = [];
  if (zoneKinds.includes("landscape") || !zoneKinds.length) out.push(nativeSoilPlan(site));
  if (zoneKinds.includes("edible")) out.push(edibleSoilPlan(site, { containers: !!space && CONTAINER_SPACES.includes(space) }));
  return out;
}
