/**
 * AI features (spec 3B.3) built on lib/ai/gemini.ts. Rules decide, AI explains: each function takes the rule output,
 * asks Gemini to reword or pick, validates that nothing was added, removed or invented, and returns the rule text
 * on any failure. Nothing here talks to Gemini directly.
 */
import { z } from "zod";

import type { ActionStep, Diagnosis } from "../types";
import { readData } from "../clients/base";
import { AiError, generateJSON, generateText } from "./gemini";

export const DEMO_PHOTOS = ["healthy_firebush", "spotted_firebush", "mexican_petunia"] as const;
export type DemoPhoto = (typeof DEMO_PHOTOS)[number];
export type AiSource = "gemini" | "fixture" | "template";

const warn = (task: string, e: unknown) => console.warn(`[ai:${task}] fallback:`, (e as Error).message);

// ---------------------------------------------------------------- diagnose

const HEALTH = ["healthy", "mild_stress", "moderate_problem", "severe_problem", "unclear"] as const;
const STAGE = ["vegetative", "budding", "flowering", "fruiting", "dormant", "unclear"] as const;

export const DiagnosisZ = z.object({
  overall_health: z.enum(HEALTH),
  phenology_stage: z.enum(STAGE),
  candidates: z.array(z.object({ issue_key: z.string().min(1), label: z.string().min(1), confidence: z.number(), evidence: z.string() })).max(6),
  actions: z.array(z.string()),
  see_expert: z.boolean(),
});

const DIAGNOSIS_SCHEMA = {
  type: "object",
  properties: {
    overall_health: { type: "string", enum: HEALTH },
    phenology_stage: { type: "string", enum: STAGE },
    candidates: {
      type: "array", maxItems: 3,
      items: {
        type: "object",
        properties: { issue_key: { type: "string" }, label: { type: "string" }, confidence: { type: "number" }, evidence: { type: "string" } },
        required: ["issue_key", "label", "confidence", "evidence"],
      },
    },
    actions: { type: "array", items: { type: "string" } },
    see_expert: { type: "boolean" },
  },
  required: ["overall_health", "phenology_stage", "candidates", "actions", "see_expert"],
};

function clean(d: Diagnosis): Diagnosis {
  return {
    ...d,
    candidates: [...d.candidates].sort((a, b) => b.confidence - a.confidence).slice(0, 3)
      .map((c) => ({ ...c, confidence: Math.max(0, Math.min(1, c.confidence)) })),
    actions: d.actions.slice(0, 6),
  };
}

const UNCLEAR: Diagnosis = {
  overall_health: "unclear", phenology_stage: "unclear", candidates: [],
  actions: ["We couldn't check this photo right now. Try again later, or ask your local UF/IFAS Extension office."], see_expert: false,
};

/** Leaf photo (already resized ≤ 1600 px, EXIF stripped by lib/checkin.ts) + context → diagnosis. */
export async function diagnose(image: { base64: string; mime: string }, context: unknown, demoPhoto?: string | null): Promise<{ diagnosis: Diagnosis; source: "live" | "fixture" }> {
  const meta: { source?: "live" | "fixture" | "cache" } = {};
  try {
    const d = await generateJSON({
      task: "diagnose", meta, schema: DiagnosisZ, responseSchema: DIAGNOSIS_SCHEMA,
      demoId: demoPhoto ?? "default",
      prompt: [{ inlineData: { mimeType: image.mime, data: image.base64 } }, { text: `Context JSON:\n${JSON.stringify(context)}` }],
    });
    return { diagnosis: clean(d), source: meta.source === "fixture" ? "fixture" : "live" };
  } catch (e) {
    warn("diagnose", e);
    return { diagnosis: UNCLEAR, source: "fixture" };
  }
}

// ---------------------------------------------------------------- soil photo (weak evidence only)

export const SoilPhotoZ = z.object({
  color: z.string(),
  texture_hint: z.enum(["sandy", "loamy", "clayey", "mucky", "unclear"]),
  fragments: z.string(),
  organic_look: z.enum(["low", "medium", "high", "unclear"]),
  note: z.string(),
});
export type SoilPhoto = z.infer<typeof SoilPhotoZ>;

export async function soilPhoto(image: { base64: string; mime: string }, demoId?: string | null): Promise<SoilPhoto | null> {
  try {
    return await generateJSON({
      task: "soil_photo", schema: SoilPhotoZ, demoId,
      responseSchema: {
        type: "object",
        properties: {
          color: { type: "string" }, texture_hint: { type: "string", enum: ["sandy", "loamy", "clayey", "mucky", "unclear"] },
          fragments: { type: "string" }, organic_look: { type: "string", enum: ["low", "medium", "high", "unclear"] }, note: { type: "string" },
        },
        required: ["color", "texture_hint", "fragments", "organic_look", "note"],
      },
      prompt: [{ inlineData: { mimeType: image.mime, data: image.base64 } }, { text: "Describe this soil photo." }],
    });
  } catch (e) {
    warn("soil_photo", e);
    return null;
  }
}

// ---------------------------------------------------------------- rewrite rule tasks (same count, same order)

const StepsZ = z.object({ tasks: z.array(z.object({ when: z.string(), text: z.string().min(1) })) });
const STEPS_SCHEMA = {
  type: "object",
  properties: { tasks: { type: "array", items: { type: "object", properties: { when: { type: "string" }, text: { type: "string" } }, required: ["when", "text"] } } },
  required: ["tasks"],
};

/** Throws unless the rewrite has exactly the same number of tasks (order is the caller's: index i rewrites task i). */
export function checkSameCount<T>(input: readonly unknown[], output: readonly T[]): void {
  if (output.length !== input.length) throw new AiError(`expected ${input.length} items, got ${output.length}`, "invalid");
}

/**
 * Gemini may reword rule tasks for clarity but never add, remove or reorder them (spec 7.3).
 * Returns the rule tasks unchanged on any failure.
 */
export async function rewriteTasks(tasks: ActionStep[], context: string, demoId?: string | null): Promise<{ steps: ActionStep[]; source: AiSource }> {
  if (!tasks.length) return { steps: tasks, source: "template" };
  try {
    const out = await generateJSON({
      task: "alert_rewrite", model: "lite", schema: StepsZ, responseSchema: STEPS_SCHEMA, demoId,
      prompt: `Context: ${context}\nInput: ${JSON.stringify({ tasks })}`,
      check: (v) => checkSameCount(tasks, v.tasks),
    });
    return { steps: out.tasks.map((t, i) => ({ when: t.when || tasks[i].when, text: t.text })), source: "gemini" };
  } catch (e) {
    if (!(e instanceof AiError && e.kind === "unavailable")) warn("alert_rewrite", e);
    return { steps: tasks, source: "template" };
  }
}

const ItemsZ = z.object({ items: z.array(z.string().min(1)) });

/** "This week" care lines: same items in the same order, friendlier words. */
export async function careWeekWording(items: string[]): Promise<{ items: string[]; source: AiSource }> {
  if (!items.length) return { items, source: "template" };
  try {
    const out = await generateJSON({
      task: "care_week", model: "lite", schema: ItemsZ, prompt: JSON.stringify({ items }),
      responseSchema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"] },
      check: (v) => checkSameCount(items, v.items),
    });
    return { items: out.items, source: "gemini" };
  } catch (e) {
    if (!(e instanceof AiError && e.kind === "unavailable")) warn("care_week", e);
    return { items, source: "template" };
  }
}

// ---------------------------------------------------------------- dashboard alert steps (was clients/gemini actionPlan)

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export interface ActionContext {
  type: "frost" | "storm" | "water" | "disease";
  vars: Record<string, string>; // plants, first, day, first_text ...
  details: unknown; // full alert context, sent with the rewrite request
}

const plans = new Map<string, { steps: ActionStep[]; source: AiSource }>();

/**
 * Steps for a dashboard alert. The rule text comes from data/action_templates.json (filled with the alert's plants
 * and days) or the caller's template; Gemini only rewrites it.
 */
export async function actionPlan(ctx: ActionContext, template: () => ActionStep[]): Promise<{ steps: ActionStep[]; source: AiSource }> {
  const key = JSON.stringify(ctx);
  const hit = plans.get(key);
  if (hit) return hit;
  const t = readData<Record<string, { steps: ActionStep[] }>>("action_templates.json")[ctx.type];
  const rules = t ? t.steps.map((s) => ({ when: fill(s.when, ctx.vars), text: fill(s.text, ctx.vars) })) : template();
  const out = await rewriteTasks(rules, JSON.stringify(ctx.details).slice(0, 1500));
  plans.set(key, out);
  return out;
}

// ---------------------------------------------------------------- small text tasks

export async function plantBlurb(input: Record<string, unknown>, fallback: string): Promise<string> {
  try {
    const s = await generateText({ task: "plant_blurb", model: "lite", prompt: JSON.stringify(input), demoId: String(input.id ?? "") });
    return s.split("\n")[0].slice(0, 140);
  } catch {
    return fallback;
  }
}

export async function ecoExplain(input: { metric: string; values: Record<string, unknown>; formula: string }, fallback: string): Promise<{ text: string; source: AiSource }> {
  try {
    return { text: await generateText({ task: "eco_explain", model: "lite", prompt: JSON.stringify(input), demoId: input.metric.replace(/\W+/g, "_") }), source: "gemini" };
  } catch {
    return { text: fallback, source: "template" };
  }
}
