import type { Plant } from "@/lib/types";

export type Stage = "leaves" | "buds" | "flowers" | "fruit";

/** What the plant shows in `month` at `ageYears`: flowers in bloom months, buds the month before a bloom run, fruit in fruit months. */
export function stageFor(p: Plant, month: number, ageYears: number): Stage {
  if (ageYears < p.years_to_first_bloom || !p.flower_colors.length) return "leaves";
  if (p.bloom_months.includes(month)) return "flowers";
  if (p.fruit_months.includes(month) && p.fruit_colors.length) return "fruit";
  const next = month === 12 ? 1 : month + 1;
  if (p.bloom_months.includes(next)) return "buds";
  return "leaves";
}

export const STAGE_LABEL: Record<Stage, string> = { leaves: "Leaves only", buds: "Buds forming", flowers: "In bloom", fruit: "Fruiting" };
