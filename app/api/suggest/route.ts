import { NextResponse } from "next/server";

import { suggestPicks } from "@/lib/ai/suggest";
import { groupOf, isNative } from "@/lib/catalog";
import { getPlants } from "@/lib/data";
import { zoneForLat } from "@/lib/engine/zone";
import { rulePicks, suggest, THEMES, type SuggestCtx } from "@/lib/engine/suggest";
import { allow, clientIp } from "@/lib/rate-limit";
import type { Goal, PreferNatives } from "@/lib/types";
import { BadRequest, parseSite } from "@/lib/validate";

const GOALS: Goal[] = ["flowers", "food", "butterflies", "low_care"];
const PREF: PreferNatives[] = ["off", "some", "mostly"];

/**
 * POST /api/suggest { site, zone?, themes[], goals?, prefer_natives?, hours_week?, ai? }
 * → { zone, picks (with reasons and badges), candidates (top 30), source: gemini | rules }.
 * Rules filter and score (lib/engine/suggest.ts); Gemini only picks from the top 30 (lib/ai/suggest.ts).
 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const site = parseSite(b.site);
    const zone = typeof b.zone === "string" && /^\d{1,2}[ab]$/.test(b.zone) ? b.zone : zoneForLat(site.lat);
    const ctx: SuggestCtx = {
      site, zone,
      themes: (Array.isArray(b.themes) ? b.themes : []).filter((t): t is string => THEMES.some((x) => x.id === t)),
      goals: (Array.isArray(b.goals) ? b.goals : []).filter((g): g is Goal => GOALS.includes(g as Goal)),
      prefer_natives: PREF.includes(b.prefer_natives as PreferNatives) ? (b.prefer_natives as PreferNatives) : "off",
      hours_week: b.hours_week === "1" || b.hours_week === "2-4" || b.hours_week === "5+" ? b.hours_week : null,
      today: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    };
    const plants = await getPlants();
    const { ranked, excluded } = suggest(plants, ctx);
    // The AI pass is rate limited; past the limit (or with ai: false) the rule picks are used.
    const useAi = b.ai !== false && allow(`suggest:${clientIp(req)}`, 30);
    const { picks, source } = useAi ? await suggestPicks(ranked, ctx) : { picks: rulePicks(ranked, ctx), source: "rules" as const };
    const byId = new Map(ranked.map((s) => [s.plant.id, s]));
    const slim = (id: string) => {
      const s = byId.get(id)!;
      return {
        id, name: s.plant.common_name, category: s.plant.category, group: groupOf(s.plant), native: isNative(s.plant), score: s.score,
        theme: s.theme, reasons: s.reasons, when: s.when, colors: s.plant.flower_colors.slice(0, 2), fl_notes: s.plant.fl_notes ?? null,
        spread_ft: s.plant.mature_spread_ft, edible: !!s.plant.edible || groupOf(s.plant) === "fruit",
      };
    };
    return NextResponse.json({
      zone, source, excluded: excluded.length,
      picks: picks.map((p) => ({ ...slim(p.plant_id), qty: p.qty, reason: p.reason })),
      candidates: ranked.slice(0, 30).map((s) => slim(s.plant.id)),
    });
  } catch (e) {
    if (e instanceof BadRequest || e instanceof SyntaxError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[suggest]", e);
    return NextResponse.json({ error: "Could not make suggestions right now." }, { status: 500 });
  }
}
