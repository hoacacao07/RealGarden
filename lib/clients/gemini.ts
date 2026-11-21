/**
 * Gemini (REST generateContent with structured JSON output). Model name from GEMINI_MODEL.
 * Diagnosis of a plant photo, and short action plans for alerts.
 */
import type { ActionStep, Diagnosis } from "../types";
import { fetchJson, fixture, liveOrFixture } from "./base";

const URL = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const DIAGNOSE_SYSTEM = `You are a careful plant health assistant for Florida native gardens.
Rules:
- Use only the plant context you are given (plant profile, site, last 7 days of weather) plus the photo.
- Give at most 3 candidate issues, ordered by confidence (0 to 1).
- Prefer "unclear" over guessing when the photo does not clearly show symptoms.
- Set see_expert=true for moderate or severe problems and suggest confirming with the local UF/IFAS Extension office.
- Never name pesticide products, brands, or doses. Cultural practices only.
- Use snake_case issue_key values; reuse keys from the plant's common_issues when they fit.
- Also report the phenology stage you see (budding, flowering, fruiting...).
- Write actions in plain language, short sentences.`;

const ACTION_SYSTEM = `Turn a garden alert into 3 to 6 short, concrete steps with times (for example "Tonight by 9 PM").
Mention the affected plants by name. Plain language. No pesticide products or doses. Each step under 20 words.`;

const DIAGNOSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    overall_health: { type: "STRING", enum: ["healthy", "mild_stress", "moderate_problem", "severe_problem", "unclear"] },
    phenology_stage: { type: "STRING", enum: ["vegetative", "budding", "flowering", "fruiting", "dormant", "unclear"] },
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { issue_key: { type: "STRING" }, label: { type: "STRING" }, confidence: { type: "NUMBER" }, evidence: { type: "STRING" } },
        required: ["issue_key", "label", "confidence", "evidence"],
      },
    },
    actions: { type: "ARRAY", items: { type: "STRING" } },
    see_expert: { type: "BOOLEAN" },
  },
  required: ["overall_health", "phenology_stage", "candidates", "actions", "see_expert"],
};

const ACTION_SCHEMA = {
  type: "OBJECT",
  properties: { steps: { type: "ARRAY", items: { type: "OBJECT", properties: { when: { type: "STRING" }, text: { type: "STRING" } }, required: ["when", "text"] } } },
  required: ["steps"],
};

async function generate<T>(system: string, parts: unknown[], schema: unknown, signal: AbortSignal): Promise<T> {
  const j = await fetchJson<{ candidates?: { content?: { parts?: { text?: string }[] } }[] }>(URL(process.env.GEMINI_MODEL!), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
  });
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("empty Gemini response");
  return JSON.parse(text) as T;
}

const keys = () => [process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL];

export const DEMO_PHOTOS = ["healthy_firebush", "spotted_firebush", "mexican_petunia"] as const;
export type DemoPhoto = (typeof DEMO_PHOTOS)[number];

function clean(d: Diagnosis): Diagnosis {
  return {
    ...d,
    candidates: [...(d.candidates ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 3)
      .map((c) => ({ ...c, confidence: Math.max(0, Math.min(1, c.confidence)) })),
    actions: (d.actions ?? []).slice(0, 6),
  };
}

export async function diagnose(image: { base64: string; mime: string }, context: unknown, demoPhoto?: string | null) {
  const fx = () => {
    const all = fixture<Record<string, Diagnosis>>("gemini_diagnosis.json");
    return all[demoPhoto ?? ""] ?? all.default;
  };
  const r = await liveOrFixture("gemini-diagnose", {
    needs: keys(),
    live: (signal) => generate<Diagnosis>(DIAGNOSE_SYSTEM, [
      { inline_data: { mime_type: image.mime, data: image.base64 } },
      { text: `Context JSON:\n${JSON.stringify(context)}` },
    ], DIAGNOSIS_SCHEMA, signal),
    fallback: fx,
  });
  return { diagnosis: clean(r.data), source: r.source };
}

/** Fill {placeholders} in fixture steps. */
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export interface ActionContext {
  type: "frost" | "storm" | "water" | "disease";
  vars: Record<string, string>; // plants, first, day, first_text ...
  details: unknown; // full alert context for the live prompt
}

const plans = new Map<string, { steps: ActionStep[]; source: "gemini" | "fixture" | "template" }>();

export async function actionPlan(ctx: ActionContext, template: () => ActionStep[]): Promise<{ steps: ActionStep[]; source: "gemini" | "fixture" | "template" }> {
  const key = JSON.stringify(ctx);
  const hit = plans.get(key);
  if (hit) return hit;
  const r = await liveOrFixture("gemini-action", {
    needs: keys(),
    live: async (signal) => {
      const out = await generate<{ steps: ActionStep[] }>(ACTION_SYSTEM, [{ text: JSON.stringify(ctx.details) }], ACTION_SCHEMA, signal);
      if (!out.steps || out.steps.length < 3) throw new Error("too few steps");
      return out.steps.slice(0, 6);
    },
    fallback: () => {
      const fx = fixture<Record<string, { steps: ActionStep[] }>>("gemini_action_plans.json")[ctx.type];
      return fx ? fx.steps.map((s) => ({ when: fill(s.when, ctx.vars), text: fill(s.text, ctx.vars) })) : template();
    },
  });
  const out = { steps: r.data, source: r.source === "live" ? ("gemini" as const) : ("fixture" as const) };
  plans.set(key, out);
  return out;
}
