/**
 * Gemini LLM layer (spec 3B). The ONLY module that calls Gemini.
 *
 *   generateJSON   structured output (JSON schema) → zod validation; one repair retry with the error appended
 *   generateText   plain text
 *   chatWithTools  manual function-calling loop with streaming (max 5 rounds); write tools are never executed here,
 *                  they come back as `proposal` events and only run after the user taps Confirm (/api/chat/confirm)
 *
 * Shared behavior: model names from env only (GEMINI_MODEL, GEMINI_MODEL_LITE), timeout GEMINI_TIMEOUT_MS,
 * output cap GEMINI_MAX_OUTPUT_TOKENS, retry on 429 / 5xx with exponential backoff (max 2 retries), 24 h result cache
 * (AiCache, never for chat), one AiLog row per call. DEMO_MODE=true serves data/fixtures/gemini/<task>/<id>.json
 * (by demo id, then by input hash) and only calls live when no fixture exists and a key is set.
 * Callers always have a rule-based fallback: every failure here throws an AiError.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { z } from "zod";

import { demoMode } from "../clients/base";
import { loadPrompt } from "./prompts";
import { defaultStore, type AiStore } from "./store";

export type AiTask =
  | "diagnose" | "soil_photo" | "suggest_pick" | "plant_blurb" | "alert_rewrite" | "care_week" | "eco_explain" | "assistant";

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Gemini wire content (role + parts). Model turns are kept raw so thought signatures survive the tool loop. */
export interface Content { role: "user" | "model"; parts: Record<string, unknown>[] }

export interface ChatMessage { role: "user" | "model"; text: string; images?: { mimeType: string; data: string }[] }

export interface ToolDef<I = unknown> {
  name: string;
  description: string;
  /** JSON schema of the arguments (sent to Gemini as parametersJsonSchema). */
  parameters: Record<string, unknown>;
  input: z.ZodType<I>;
  /** Read tools run on the server inside the loop. Write tools (write: true) never run here. */
  handler?: (input: I) => Promise<unknown>;
  write?: boolean;
  /** Short label for the UI chip, e.g. "Checked your forecast". */
  label?: (input: I, result: unknown) => string;
}

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: unknown }
  | { type: "tool_result"; id: string; name: string; label: string; result: unknown; error?: string }
  | { type: "proposal"; id: string; name: string; args: unknown }
  | { type: "done"; text: string; rounds: number; source: "live" | "fixture" };

export class AiError extends Error {
  constructor(message: string, public kind: "unavailable" | "invalid" | "timeout" | "api" = "api", public status?: number) { super(message); }
}

// ---------------------------------------------------------------- transport (swappable for tests)

export interface GenRequest {
  model: string;
  system: string;
  contents: Content[];
  responseJsonSchema?: object;
  tools?: { name: string; description: string; parametersJsonSchema: unknown }[];
  maxOutputTokens: number;
  temperature?: number;
}
export interface GenChunk {
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
  /** Raw model parts of this chunk (kept for the next round so thought signatures are sent back). */
  parts: Record<string, unknown>[];
  usage?: { in?: number; out?: number };
}
export interface Transport {
  generate(req: GenRequest, signal: AbortSignal): Promise<GenChunk>;
  stream(req: GenRequest, signal: AbortSignal): AsyncIterable<GenChunk>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toChunk(r: any): GenChunk {
  const parts = (r?.candidates?.[0]?.content?.parts ?? []) as Record<string, unknown>[];
  const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text as string).join("");
  const calls = parts.filter((p) => p.functionCall).map((p) => {
    const fc = p.functionCall as { id?: string; name?: string; args?: Record<string, unknown> };
    return { id: fc.id, name: fc.name ?? "", args: fc.args ?? {} };
  });
  const u = r?.usageMetadata;
  return { text, calls, parts, usage: u ? { in: u.promptTokenCount, out: u.candidatesTokenCount } : undefined };
}

let sdk: any = null;
async function client() {
  if (!sdk) {
    const { GoogleGenAI } = await import("@google/genai");
    sdk = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return sdk;
}

const sdkConfig = (req: GenRequest, signal: AbortSignal) => ({
  systemInstruction: req.system,
  maxOutputTokens: req.maxOutputTokens,
  temperature: req.temperature ?? 0.3,
  abortSignal: signal,
  ...(req.responseJsonSchema && { responseMimeType: "application/json", responseJsonSchema: req.responseJsonSchema }),
  ...(req.tools?.length && {
    tools: [{ functionDeclarations: req.tools }],
    // Manual loop: the SDK must not run tools by itself.
    automaticFunctionCalling: { disable: true },
  }),
});

const sdkTransport: Transport = {
  async generate(req, signal) {
    const ai = await client();
    return toChunk(await ai.models.generateContent({ model: req.model, contents: req.contents, config: sdkConfig(req, signal) }));
  },
  async *stream(req, signal) {
    const ai = await client();
    const it = await ai.models.generateContentStream({ model: req.model, contents: req.contents, config: sdkConfig(req, signal) });
    for await (const r of it) yield toChunk(r);
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

let transport: Transport = sdkTransport;
let store: AiStore = defaultStore;
let sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Test hooks. */
export function __setAi(o: { transport?: Transport; store?: AiStore; sleep?: (ms: number) => Promise<void> }) {
  if (o.transport) transport = o.transport;
  if (o.store) store = o.store;
  if (o.sleep) sleep = o.sleep;
}
export function __resetAi() {
  transport = sdkTransport;
  store = defaultStore;
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------- config

export const MAX_TOOL_ROUNDS = 5;
const MAX_RETRIES = 2;
const CACHE_MS = 24 * 3600e3;

const timeoutMs = () => Number(process.env.GEMINI_TIMEOUT_MS) || 20_000;
const maxOut = () => Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 1000;
export const hasKey = () => !!process.env.GEMINI_API_KEY && !!process.env.GEMINI_MODEL;

/** Model id from env. Never hardcoded: "lite" falls back to the main model when GEMINI_MODEL_LITE is empty. */
export function modelFor(kind: "main" | "lite"): string {
  const m = kind === "lite" ? process.env.GEMINI_MODEL_LITE || process.env.GEMINI_MODEL : process.env.GEMINI_MODEL;
  if (!m) throw new AiError("GEMINI_MODEL is not set", "unavailable");
  return m;
}

const retryable = (e: unknown) => {
  const s = (e as { status?: number }).status;
  return s === 429 || (typeof s === "number" && s >= 500);
};

/** One live call with timeout and retry on 429/5xx (exponential backoff, max 2 retries). */
async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs());
    try {
      return await fn(ctrl.signal);
    } catch (e) {
      if (timedOut) throw new AiError(`Gemini timed out after ${timeoutMs()} ms`, "timeout");
      if (attempt < MAX_RETRIES && retryable(e)) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (e instanceof AiError) throw e;
      throw new AiError((e as Error).message ?? "Gemini error", "api", (e as { status?: number }).status);
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------- hashing, fixtures, logging

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Stable key: images are replaced by the hash of their bytes. */
export function inputHash(task: string, model: string, prompt: string | Part[]): string {
  const norm = typeof prompt === "string" ? prompt
    : JSON.stringify(prompt.map((p) => ("inlineData" in p ? { img: sha(p.inlineData.data) } : p)));
  return sha(`${task}|${model}|${norm}`).slice(0, 24);
}

const FIXTURES = () => path.join(process.cwd(), "data", "fixtures", "gemini");

export function readFixture(task: AiTask, ids: (string | null | undefined)[]): unknown | null {
  for (const id of ids) {
    if (!id || !/^[\w-]+$/.test(id)) continue;
    const f = path.join(FIXTURES(), task, `${id}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  }
  return null;
}

async function log(e: Parameters<AiStore["log"]>[0]) {
  try { await store.log(e); } catch { /* logging never breaks a feature */ }
}

const toParts = (prompt: string | Part[]): Record<string, unknown>[] =>
  typeof prompt === "string" ? [{ text: prompt }] : (prompt as Record<string, unknown>[]);

// ---------------------------------------------------------------- public API

export interface JsonOpts<T> {
  task: AiTask;
  prompt: string | Part[];
  schema: z.ZodType<T>;
  responseSchema: object;
  model?: "main" | "lite";
  /** Demo fixture id (e.g. the demo photo name). */
  demoId?: string | null;
  /** Extra check after zod (e.g. "only ids from the input"). Throw to reject. */
  check?: (v: T) => void;
  cache?: boolean;
}

export async function generateJSON<T>(opts: JsonOpts<T>): Promise<T> {
  const p = loadPrompt(opts.task);
  const kind = opts.model ?? p.model;
  const modelName = hasKey() ? modelFor(kind) : kind;
  const key = inputHash(opts.task, `${modelName}@v${p.version}`, opts.prompt);
  const validate = (raw: unknown): T => {
    const v = opts.schema.parse(raw);
    opts.check?.(v);
    return v;
  };

  if (demoMode()) {
    const fx = readFixture(opts.task, [opts.demoId, key]);
    if (fx != null) {
      await log({ task: opts.task, model: "fixture", latency_ms: 0, cache_hit: true, error: null });
      return validate(fx);
    }
  }
  if (!hasKey()) throw new AiError("No Gemini key (GEMINI_API_KEY, GEMINI_MODEL)", "unavailable");

  if (opts.cache !== false) {
    const hit = await store.get(key).catch(() => null);
    if (hit != null) {
      try {
        const v = validate(hit);
        await log({ task: opts.task, model: modelName, latency_ms: 0, cache_hit: true, error: null });
        return v;
      } catch { /* stale cache entry, call again */ }
    }
  }

  const contents: Content[] = [{ role: "user", parts: toParts(opts.prompt) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    let chunk: GenChunk;
    try {
      chunk = await withRetry((signal) => transport.generate({ model: modelName, system: p.system, contents, responseJsonSchema: opts.responseSchema, maxOutputTokens: maxOut(), temperature: 0.2 }, signal));
    } catch (e) {
      await log({ task: opts.task, model: modelName, latency_ms: Date.now() - t0, cache_hit: false, error: (e as Error).message });
      throw e;
    }
    try {
      const v = validate(JSON.parse(chunk.text));
      await log({ task: opts.task, model: modelName, latency_ms: Date.now() - t0, in_tokens: chunk.usage?.in, out_tokens: chunk.usage?.out, cache_hit: false, error: null });
      if (opts.cache !== false) await store.set(key, opts.task, v, CACHE_MS).catch(() => undefined);
      return v;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      await log({ task: opts.task, model: modelName, latency_ms: Date.now() - t0, in_tokens: chunk.usage?.in, out_tokens: chunk.usage?.out, cache_hit: false, error: `invalid: ${msg}` });
      if (attempt === 1) throw new AiError(`Gemini returned invalid JSON for ${opts.task}: ${msg}`, "invalid");
      contents.push({ role: "model", parts: [{ text: chunk.text }] });
      contents.push({ role: "user", parts: [{ text: `Your last answer failed validation: ${msg}\nReply again with JSON that matches the schema exactly.` }] });
    }
  }
  throw new AiError("unreachable", "invalid");
}

export async function generateText(opts: { task: AiTask; prompt: string; model?: "main" | "lite"; demoId?: string | null }): Promise<string> {
  const p = loadPrompt(opts.task);
  const kind = opts.model ?? p.model;
  const modelName = hasKey() ? modelFor(kind) : kind;
  const key = inputHash(opts.task, `${modelName}@v${p.version}`, opts.prompt);
  if (demoMode()) {
    const fx = readFixture(opts.task, [opts.demoId, key]) as { text?: string } | null;
    if (fx?.text) return fx.text;
  }
  if (!hasKey()) throw new AiError("No Gemini key", "unavailable");
  const hit = (await store.get(key).catch(() => null)) as string | null;
  if (typeof hit === "string") {
    await log({ task: opts.task, model: modelName, latency_ms: 0, cache_hit: true, error: null });
    return hit;
  }
  const t0 = Date.now();
  try {
    const c = await withRetry((signal) => transport.generate({ model: modelName, system: p.system, contents: [{ role: "user", parts: [{ text: opts.prompt }] }], maxOutputTokens: maxOut() }, signal));
    const text = c.text.trim();
    if (!text) throw new AiError("empty Gemini response", "invalid");
    await log({ task: opts.task, model: modelName, latency_ms: Date.now() - t0, in_tokens: c.usage?.in, out_tokens: c.usage?.out, cache_hit: false, error: null });
    await store.set(key, opts.task, text, CACHE_MS).catch(() => undefined);
    return text;
  } catch (e) {
    await log({ task: opts.task, model: modelName, latency_ms: Date.now() - t0, cache_hit: false, error: (e as Error).message });
    throw e;
  }
}

/** Fixture for a scripted chat answer (DEMO_MODE): text plus the tool chips it pretends to have used. */
export interface ChatFixture { text: string; tools?: { name: string; label: string }[]; proposals?: { name: string; args: unknown }[] }

/**
 * Manual function-calling loop. Each round streams the model's answer; if it asks for tools, read tools run
 * server-side (zod-validated input, compact JSON output) and the results go back as functionResponse parts.
 * Write tools are NOT executed: the loop emits a `proposal` and tells the model the user must confirm.
 * Stops after MAX_TOOL_ROUNDS rounds of tool calls.
 */
export async function* chatWithTools(opts: {
  messages: ChatMessage[];
  tools: ToolDef<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  system?: string;
  demoId?: string | null;
  onToken?: (t: string) => void;
}): AsyncGenerator<ChatEvent> {
  if (demoMode() && opts.demoId) {
    const fx = readFixture("assistant", [opts.demoId]) as ChatFixture | null;
    if (fx) {
      let n = 0;
      for (const t of fx.tools ?? []) {
        const id = `fx${n++}`;
        yield { type: "tool_call", id, name: t.name, args: {} };
        yield { type: "tool_result", id, name: t.name, label: t.label, result: null };
      }
      for (const pr of fx.proposals ?? []) yield { type: "proposal", id: `fx${n++}`, name: pr.name, args: pr.args };
      for (const piece of fx.text.match(/[^\s]+\s*/g) ?? []) {
        opts.onToken?.(piece);
        yield { type: "text", text: piece };
      }
      await log({ task: "assistant", model: "fixture", latency_ms: 0, cache_hit: true, error: null });
      yield { type: "done", text: fx.text, rounds: 0, source: "fixture" };
      return;
    }
  }
  if (!hasKey()) throw new AiError("No Gemini key", "unavailable");

  const p = loadPrompt("assistant");
  const model = modelFor("main");
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const decl = opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  const contents: Content[] = opts.messages.map((m) => ({
    role: m.role,
    parts: [...(m.images ?? []).map((i) => ({ inlineData: i })), { text: m.text }],
  }));
  let all = "";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const t0 = Date.now();
    const parts: Record<string, unknown>[] = [];
    const calls: GenChunk["calls"] = [];
    let usage: GenChunk["usage"];
    // Last round: no tools offered, so the model has to answer in text.
    const offer = round < MAX_TOOL_ROUNDS ? decl : undefined;
    try {
      const it = await withRetry(async (signal) => {
        // Open the stream inside the retry so 429s on connect are retried; chunks then stream without retry.
        const s = transport.stream({ model, system: opts.system ?? p.system, contents, tools: offer, maxOutputTokens: maxOut() }, signal)[Symbol.asyncIterator]();
        const first = await s.next();
        return { s, first };
      });
      for (let r = it.first; !r.done; r = await it.s.next()) {
        const c = r.value;
        parts.push(...c.parts);
        calls.push(...c.calls);
        if (c.usage) usage = c.usage;
        if (c.text) {
          all += c.text;
          opts.onToken?.(c.text);
          yield { type: "text", text: c.text };
        }
      }
    } catch (e) {
      await log({ task: "assistant", model, latency_ms: Date.now() - t0, cache_hit: false, error: (e as Error).message });
      throw e instanceof AiError ? e : new AiError((e as Error).message, "api");
    }
    await log({ task: "assistant", model, latency_ms: Date.now() - t0, in_tokens: usage?.in, out_tokens: usage?.out, cache_hit: false, error: null });
    if (!calls.length) {
      yield { type: "done", text: all, rounds: round, source: "live" };
      return;
    }
    contents.push({ role: "model", parts });
    const responses: Record<string, unknown>[] = [];
    for (const [i, call] of calls.entries()) {
      const id = call.id ?? `c${round}_${i}`;
      yield { type: "tool_call", id, name: call.name, args: call.args };
      const tool = byName.get(call.name);
      let result: unknown;
      let error: string | undefined;
      if (!tool) {
        error = `Unknown tool ${call.name}`;
      } else {
        const parsed = tool.input.safeParse(call.args);
        if (!parsed.success) {
          error = `Invalid arguments: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`;
        } else if (tool.write) {
          // Never write here. The UI shows a Confirm card; /api/chat/confirm performs the write.
          yield { type: "proposal", id, name: call.name, args: parsed.data };
          result = { status: "waiting_for_user_confirmation", note: "Shown to the user as a card with a Confirm button. Do not say it is done." };
        } else {
          try {
            result = await tool.handler!(parsed.data);
          } catch (e) {
            error = (e as Error).message;
          }
        }
      }
      const label = error ? `Couldn't run ${call.name}` : tool?.label?.(call.args, result) ?? call.name;
      yield { type: "tool_result", id, name: call.name, label, result, error };
      responses.push({ functionResponse: { ...(call.id && { id: call.id }), name: call.name, response: error ? { error } : { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  yield { type: "done", text: all, rounds: MAX_TOOL_ROUNDS, source: "live" };
}
