/**
 * Suggestion AI pass (spec 6C.4 step 4, task suggest_pick). Gemini gets the top 30 candidates with their scores and
 * picks a balanced set with one-line reasons. It may only choose from the candidates (validatePicks); on any failure
 * the rule picks (top scores) are used.
 */
import { z } from "zod";

import { groupOf, isNative } from "../catalog";
import { rulePicks, validatePicks, type PlantPick, type SuggestCtx, type Suggestion } from "../engine/suggest";
import { AiError, generateJSON } from "./gemini";

const PicksZ = z.object({ picks: z.array(z.object({ plant_id: z.string(), qty: z.number().int(), reason: z.string().min(1).max(160) })).min(1).max(12) });

export async function suggestPicks(ranked: Suggestion[], ctx: SuggestCtx): Promise<{ picks: PlantPick[]; source: "gemini" | "rules" }> {
  const top = ranked.slice(0, 30);
  const fallback = () => ({ picks: rulePicks(ranked, ctx), source: "rules" as const });
  if (!top.length) return { picks: [], source: "rules" };
  const ids = new Set(top.map((s) => s.plant.id));
  const input = {
    style: ctx.themes, goals: ctx.goals ?? [], prefer_natives: ctx.prefer_natives,
    place: { kind: ctx.site.kind ?? "yard", area_sqft: ctx.site.area_sqft, sun: ctx.site.sun, region: ctx.site.region, zone: ctx.zone },
    candidates: top.map((s) => ({
      plant_id: s.plant.id, name: s.plant.common_name, group: groupOf(s.plant), native: isNative(s.plant), score: s.score,
      colors: s.plant.flower_colors.map((c) => c.name), bloom_months: s.plant.bloom_months, size_ft: s.plant.mature_spread_ft, when: s.when.label,
    })),
  };
  try {
    const out = await generateJSON({
      task: "suggest_pick", schema: PicksZ, prompt: JSON.stringify(input),
      responseSchema: {
        type: "object",
        properties: { picks: { type: "array", items: { type: "object", properties: { plant_id: { type: "string", enum: [...ids] }, qty: { type: "integer" }, reason: { type: "string" } }, required: ["plant_id", "qty", "reason"] } } },
        required: ["picks"],
      },
      check: (v) => { validatePicks(v.picks, ids); },
    });
    return { picks: out.picks, source: "gemini" };
  } catch (e) {
    if (!(e instanceof AiError && e.kind === "unavailable")) console.warn("[ai:suggest_pick] fallback:", (e as Error).message);
    return fallback();
  }
}
