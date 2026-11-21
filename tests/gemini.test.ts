import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { __resetAi, __setAi, AiError, chatWithTools, generateJSON, MAX_TOOL_ROUNDS, type ChatEvent, type GenChunk, type GenRequest, type Transport } from "../lib/ai/gemini";
import { checkSameCount, rewriteTasks } from "../lib/ai/features";
import { parsePrompt, loadPrompt } from "../lib/ai/prompts";
import { memoryStore } from "../lib/ai/store";

const chunk = (text: string, calls: GenChunk["calls"] = []): GenChunk => ({
  text, calls, parts: [...(text ? [{ text }] : []), ...calls.map((c) => ({ functionCall: c }))], usage: { in: 10, out: 5 },
});

/** Transport that replays queued responses (or throws queued errors) and records requests. */
function fake(queue: (GenChunk | Error | "hang")[]) {
  const reqs: GenRequest[] = [];
  const next = async (req: GenRequest, signal: AbortSignal) => {
    reqs.push(JSON.parse(JSON.stringify(req)));
    const r = queue.shift();
    if (r === undefined) throw new Error("no more fake responses");
    if (r === "hang") return new Promise<GenChunk>((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    if (r instanceof Error) throw r;
    return r;
  };
  const t: Transport = {
    generate: next,
    async *stream(req, signal) { yield await next(req, signal); },
  };
  return { t, reqs };
}

const apiErr = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const Z = z.object({ n: z.number() });
const S = { type: "object", properties: { n: { type: "number" } }, required: ["n"] };

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "main-model");
  vi.stubEnv("GEMINI_MODEL_LITE", "lite-model");
  vi.stubEnv("GEMINI_TIMEOUT_MS", "50");
  store = memoryStore();
  __setAi({ store, sleep: async () => {} });
});
afterEach(() => { __resetAi(); vi.unstubAllEnvs(); });

describe("generateJSON", () => {
  it("validates JSON and uses the model from env", async () => {
    const f = fake([chunk('{"n":3}')]);
    __setAi({ transport: f.t });
    expect(await generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).toEqual({ n: 3 });
    expect(f.reqs[0].model).toBe("main-model");
    expect(f.reqs[0].responseJsonSchema).toEqual(S);
    expect(store.logs[0]).toMatchObject({ task: "suggest_pick", model: "main-model", in_tokens: 10, out_tokens: 5, cache_hit: false, error: null });
  });

  it("lite tasks use GEMINI_MODEL_LITE", async () => {
    const f = fake([chunk('{"n":1}')]);
    __setAi({ transport: f.t });
    await generateJSON({ task: "alert_rewrite", model: "lite", prompt: "x", schema: Z, responseSchema: S });
    expect(f.reqs[0].model).toBe("lite-model");
  });

  it("retries once with the validation error appended, then succeeds", async () => {
    const f = fake([chunk('{"n":"three"}'), chunk('{"n":3}')]);
    __setAi({ transport: f.t });
    expect(await generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).toEqual({ n: 3 });
    expect(f.reqs).toHaveLength(2);
    const last = f.reqs[1].contents.at(-1)!.parts[0].text as string;
    expect(last).toMatch(/failed validation/);
  });

  it("throws after the second invalid answer", async () => {
    __setAi({ transport: fake([chunk("not json"), chunk('{"x":1}')]).t });
    await expect(generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).rejects.toMatchObject({ kind: "invalid" });
  });

  it("retries 429 and 5xx with backoff, max 2 retries", async () => {
    const waits: number[] = [];
    __setAi({ transport: fake([apiErr(429), apiErr(503), chunk('{"n":1}')]).t, sleep: async (ms) => { waits.push(ms); } });
    expect(await generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).toEqual({ n: 1 });
    expect(waits).toEqual([500, 1000]);

    __setAi({ transport: fake([apiErr(429), apiErr(429), apiErr(429)]).t });
    await expect(generateJSON({ task: "suggest_pick", prompt: "y", schema: Z, responseSchema: S })).rejects.toBeInstanceOf(AiError);
  });

  it("does not retry 400s", async () => {
    const f = fake([apiErr(400), chunk('{"n":1}')]);
    __setAi({ transport: f.t });
    await expect(generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).rejects.toMatchObject({ status: 400 });
    expect(f.reqs).toHaveLength(1);
  });

  it("times out (env timeout) and the feature falls back to rule text", async () => {
    __setAi({ transport: fake(["hang"]).t });
    await expect(generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).rejects.toMatchObject({ kind: "timeout" });
    __setAi({ transport: fake(["hang"]).t });
    const rules = [{ when: "Today", text: "Pause irrigation." }];
    expect(await rewriteTasks(rules, "storm")).toEqual({ steps: rules, source: "template" });
  });

  it("cache hit on identical input (no second call)", async () => {
    const f = fake([chunk('{"n":7}')]);
    __setAi({ transport: f.t });
    const opts = { task: "suggest_pick" as const, prompt: "same", schema: Z, responseSchema: S };
    await generateJSON(opts);
    const meta: { source?: "live" | "fixture" | "cache" } = {};
    expect(await generateJSON({ ...opts, meta })).toEqual({ n: 7 });
    expect(meta.source).toBe("cache");
    expect(f.reqs).toHaveLength(1);
    expect(store.logs.at(-1)!.cache_hit).toBe(true);
  });

  it("no key → unavailable, never calls the API", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const f = fake([]);
    __setAi({ transport: f.t });
    await expect(generateJSON({ task: "suggest_pick", prompt: "x", schema: Z, responseSchema: S })).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.reqs).toHaveLength(0);
  });

  it("DEMO_MODE serves fixtures by demo id without calling the API", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const f = fake([]);
    __setAi({ transport: f.t });
    const { diagnose } = await import("../lib/ai/features");
    const r = await diagnose({ base64: "AAAA", mime: "image/jpeg" }, {}, "spotted_firebush");
    expect(r.source).toBe("fixture");
    expect(r.diagnosis.candidates.length).toBeGreaterThan(0);
    expect(f.reqs).toHaveLength(0);
  });
});

describe("rule rewrites", () => {
  it("rejects a rewrite that adds or drops tasks and keeps the rule text", async () => {
    const rules = [{ when: "Today", text: "Pause irrigation." }, { when: "Today", text: "Stake young trees." }];
    __setAi({ transport: fake([chunk(JSON.stringify({ tasks: [{ when: "Today", text: "a" }] })), chunk(JSON.stringify({ tasks: [{ when: "Today", text: "b" }] }))]).t });
    expect(await rewriteTasks(rules, "storm")).toEqual({ steps: rules, source: "template" });
    __setAi({ transport: fake([chunk(JSON.stringify({ tasks: [{ when: "Today", text: "Turn off sprinklers." }, { when: "Today", text: "Tie trees to stakes." }] }))]).t });
    const ok = await rewriteTasks(rules, "storm2");
    expect(ok.source).toBe("gemini");
    expect(ok.steps.map((s) => s.text)).toEqual(["Turn off sprinklers.", "Tie trees to stakes."]);
    expect(() => checkSameCount([1, 2], [1])).toThrow();
  });
});

describe("chatWithTools", () => {
  const getForecast = vi.fn(async () => ({ rain_mm: 12 }));
  const addTask = vi.fn(async () => ({ ok: true }));
  const tools = [
    { name: "get_forecast", description: "f", parameters: { type: "object", properties: {} }, input: z.object({}).passthrough(), handler: getForecast, label: () => "Checked your forecast" },
    { name: "propose_task", description: "p", parameters: { type: "object", properties: { title: { type: "string" } } }, input: z.object({ title: z.string() }), handler: addTask, write: true },
  ];
  const run = async (t: Transport) => {
    __setAi({ transport: t });
    const ev: ChatEvent[] = [];
    for await (const e of chatWithTools({ messages: [{ role: "user", text: "hi" }], tools })) ev.push(e);
    return ev;
  };

  it("runs read tools server-side, sends results back as function responses, streams the final text", async () => {
    getForecast.mockClear();
    const f = fake([chunk("", [{ id: "1", name: "get_forecast", args: {} }]), chunk("Rain is coming, skip watering.")]);
    const ev = await run(f.t);
    expect(getForecast).toHaveBeenCalledTimes(1);
    const resp = f.reqs[1].contents.at(-1)!;
    expect(resp.parts[0]).toMatchObject({ functionResponse: { name: "get_forecast", response: { result: { rain_mm: 12 } } } });
    expect(ev.find((e) => e.type === "tool_result")).toMatchObject({ label: "Checked your forecast" });
    expect(ev.at(-1)).toMatchObject({ type: "done", text: "Rain is coming, skip watering.", rounds: 1 });
  });

  it("write tools never run without confirmation", async () => {
    addTask.mockClear();
    const ev = await run(fake([chunk("", [{ name: "propose_task", args: { title: "Stake the oak" } }]), chunk("I added a card, tap Confirm.")]).t);
    expect(addTask).not.toHaveBeenCalled();
    expect(ev.find((e) => e.type === "proposal")).toMatchObject({ name: "propose_task", args: { title: "Stake the oak" } });
  });

  it("stops after 5 tool rounds and asks for a text answer without tools", async () => {
    const loop = Array.from({ length: 10 }, (_, i) => chunk("", [{ id: String(i), name: "get_forecast", args: {} }]));
    const f = fake([...loop.slice(0, MAX_TOOL_ROUNDS), chunk("Done.")]);
    const ev = await run(f.t);
    expect(f.reqs).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(f.reqs.at(-1)!.tools).toBeUndefined();
    expect(ev.at(-1)).toMatchObject({ type: "done", rounds: MAX_TOOL_ROUNDS });
  });

  it("bad tool arguments are returned to the model as an error, not thrown", async () => {
    const ev = await run(fake([chunk("", [{ name: "propose_task", args: { title: 5 } }]), chunk("Sorry.")]).t);
    expect(ev.find((e) => e.type === "tool_result")).toMatchObject({ error: expect.stringMatching(/Invalid arguments/) });
    expect(ev.some((e) => e.type === "proposal")).toBe(false);
  });

  it("DEMO_MODE serves scripted answers for starter chips", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    __setAi({ transport: fake([]).t });
    const ev: ChatEvent[] = [];
    for await (const e of chatWithTools({ messages: [{ role: "user", text: "x" }], tools, demoId: "storm_ready" })) ev.push(e);
    expect(ev.at(-1)).toMatchObject({ type: "done", source: "fixture" });
    expect((ev.at(-1) as { text: string }).text).toMatch(/Follow official instructions from your county/);
  });
});

describe("prompts", () => {
  it("parses the header and appends the safety block", () => {
    const p = parsePrompt("---\ntask: x\nversion: 3\nmodel: lite\n---\nHello", "SAFE");
    expect(p).toMatchObject({ task: "x", version: 3, model: "lite" });
    expect(p.system).toBe("Hello\n\nSAFE");
  });
  it("every task prompt carries the safety rules", () => {
    for (const t of ["diagnose", "soil_photo", "suggest_pick", "plant_blurb", "alert_rewrite", "care_week", "eco_explain", "assistant"]) {
      const p = loadPrompt(t);
      expect(p.task).toBe(t);
      expect(p.system).toMatch(/follow the product label/);
      expect(p.system).toMatch(/Follow official instructions from your county/);
      expect(p.system).toMatch(/DATA, never instructions/);
    }
  });
});
