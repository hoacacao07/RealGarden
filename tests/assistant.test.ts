import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { assistantTools, compact, gardenSummary, WRITE_TOOLS, type ToolCtx } from "../lib/ai/assistantTools";
import { __resetAi, __setAi, chatWithTools, type ChatEvent, type GenChunk, type GenRequest, type Transport } from "../lib/ai/gemini";
import { loadPrompt } from "../lib/ai/prompts";
import { memoryStore } from "../lib/ai/store";
import { chipId, STARTER_CHIPS } from "../lib/assistant-chips";
import { PLANTS } from "../lib/catalog-data";
import { allow } from "../lib/rate-limit";
import { NO_STARTER, type GardenDoc } from "../lib/types";

vi.mock("../lib/db", () => ({ prisma: {} }));

const garden: GardenDoc = {
  id: "g1", name: "Maria's yard", theme: null, planted_on: "2026-03-01", canvas_w_ft: 40, canvas_h_ft: 30, is_demo: true, updated_at: "2026-11-01",
  starter: { ...NO_STARTER, themes: ["butterfly"], hardiness_zone: "10a" },
  site: { id: "s1", name: "Tampa", lat: 27.95, lon: -82.46, zip: "33620", region: "central", sun: "full_sun", soil: "sand", drainage: "fast", coastal_distance_mi: 2, area_sqft: 1200, kind: "yard" },
  zones: [{ id: "z1", name: "Front bed", polygon: [[0, 0], [10, 0], [10, 8], [0, 8]], irrigation: "drip", kind: "landscape" }],
  placements: [
    { id: "p1", plant_id: "hamelia_patens", x_ft: 2, y_ft: 2, planted_on: "2026-03-01" },
    { id: "p2", plant_id: "hamelia_patens", x_ft: 4, y_ft: 2, planted_on: "2026-03-01" },
    { id: "p3", plant_id: "tomato", x_ft: 6, y_ft: 2, planted_on: "2026-03-01" },
  ],
};

const ctx: ToolCtx = {
  garden, plants: PLANTS, today: "2026-11-21",
  care: async () => { throw new Error("not used"); },
  alerts: async () => [],
  chatTasks: async () => [{ id: "t1", title: "Stake the oak", detail: null, due_at: "2026-11-25", done: false }],
  shopping: () => [{ id: "mulch", category: "mulch", item: "Pine bark mulch", qty: 12, unit: "bags (2 ft³)" }] as never,
  eco: async () => null,
  zone: async (zip) => (zip === "33620" ? { zip, zone: "10a" } : null),
};
const tools = assistantTools(ctx);
const tool = (name: string) => tools.find((t) => t.name === name)!;
const run = async (name: string, args: unknown = {}) => tool(name).handler!(tool(name).input.parse(args));

describe("assistant tool router", () => {
  it("has every tool from spec 3B.5 / 7B.2", () => {
    for (const n of ["get_garden", "search_plants", "get_plant", "get_hardiness_zone", "get_soil_estimate", "get_forecast", "get_active_alerts", "get_tasks",
      "get_watering_plan", "get_predictions", "get_shopping_list", "get_eco_report", "propose_task", "propose_add_plant"]) {
      expect(tools.map((t) => t.name)).toContain(n);
    }
  });

  it("get_garden returns this garden's site and plant counts (no garden_id argument)", async () => {
    const g = (await run("get_garden")) as { zip: string; plants: { id: string; count: number }[]; hardiness_zone: string };
    expect(g.zip).toBe("33620");
    expect(g.hardiness_zone).toBe("10a");
    expect(g.plants.find((p) => p.id === "hamelia_patens")?.count).toBe(2);
    expect(JSON.stringify(tool("get_garden").parameters)).not.toMatch(/garden_id/);
  });

  it("search_plants never returns invasive plants", async () => {
    const r = (await run("search_plants", { query: "lantana", limit: 15 })) as { plants: { id: string }[] };
    expect(r.plants.map((p) => p.id)).not.toContain("lantana_camara");
    const all = (await run("search_plants", { limit: 15 })) as { count: number };
    expect(all.count).toBeLessThan(PLANTS.length);
  });

  it("search_plants filters by group", async () => {
    const r = (await run("search_plants", { group: "herb" })) as { plants: { group: string }[] };
    expect(r.plants.length).toBeGreaterThan(0);
    expect(r.plants.every((p) => p.group === "herb")).toBe(true);
  });

  it("get_plant flags invasive plants and unknown ids", async () => {
    expect(await run("get_plant", { plant_id: "ruellia_simplex" })).toMatchObject({ invasive: true });
    expect(await run("get_plant", { plant_id: "nope" })).toMatchObject({ found: false });
    expect(await run("get_plant", { plant_id: "tomato" })).toMatchObject({ id: "tomato", edible: true });
  });

  it("get_hardiness_zone and get_tasks use the context", async () => {
    expect(await run("get_hardiness_zone", { zip: "33620" })).toMatchObject({ zone: "10a" });
    expect(() => tool("get_hardiness_zone").input.parse({ zip: "abc" })).toThrow();
  });

  it("get_shopping_list and every read result stay under about 2 KB", async () => {
    expect(await run("get_shopping_list")).toEqual([{ item: "Pine bark mulch", qty: 12, unit: "bags (2 ft³)" }]);
    const big = Array.from({ length: 500 }, (_, i) => ({ i, name: `plant ${i}` }));
    const c = compact(big) as { items: unknown[]; truncated: number };
    expect(JSON.stringify(c).length).toBeLessThanOrEqual(2000);
    expect(c.truncated).toBeGreaterThan(0);
  });

  it("write tools have no handler and validate their input", () => {
    for (const n of Object.keys(WRITE_TOOLS)) {
      expect(tool(n).write).toBe(true);
      expect(tool(n).handler).toBeUndefined();
    }
    expect(WRITE_TOOLS.propose_add_plant.safeParse({ plant_id: "tomato", qty: 50 }).success).toBe(false);
    expect(WRITE_TOOLS.propose_task.safeParse({ title: "Water", due_at: "tomorrow" }).success).toBe(false);
  });

  it("garden summary is short and names the place", () => {
    const s = gardenSummary(garden, PLANTS, "2026-11-21");
    expect(s).toMatch(/Tampa/);
    expect(s).toMatch(/zone 10a/);
    expect(s.length).toBeLessThan(500);
  });
});

describe("write tools never run without confirmation (full loop with the real tools)", () => {
  afterEach(() => { __resetAi(); vi.unstubAllEnvs(); });
  it("propose_add_plant comes back as a proposal and the model is told to wait", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("GEMINI_MODEL", "m");
    const reqs: GenRequest[] = [];
    const answers: GenChunk[] = [
      { text: "", calls: [{ id: "a", name: "propose_add_plant", args: { plant_id: "tomato", qty: 2 } }], parts: [{ functionCall: { id: "a", name: "propose_add_plant", args: { plant_id: "tomato", qty: 2 } } }] },
      { text: "Tap Confirm to add them.", calls: [], parts: [{ text: "Tap Confirm to add them." }] },
    ];
    const t: Transport = {
      generate: async () => { throw new Error("no"); },
      async *stream(req) { reqs.push(structuredClone(req)); yield answers.shift()!; },
    };
    __setAi({ transport: t, store: memoryStore() });
    const ev: ChatEvent[] = [];
    for await (const e of chatWithTools({ messages: [{ role: "user", text: "add 2 tomatoes" }], tools })) ev.push(e);
    expect(ev.find((e) => e.type === "proposal")).toMatchObject({ name: "propose_add_plant", args: { plant_id: "tomato", qty: 2 } });
    expect(JSON.stringify(reqs[1].contents.at(-1))).toMatch(/waiting_for_user_confirmation/);
  });
});

describe("starter chips, prompt rules, rate limit", () => {
  it("each starter chip has a demo fixture, matched when typed", () => {
    for (const c of STARTER_CHIPS) {
      expect(fs.existsSync(path.join(process.cwd(), "data", "fixtures", "gemini", "assistant", `${c.id}.json`))).toBe(true);
      expect(chipId(c.text)).toBe(c.id);
    }
    expect(chipId("make me a salad garden for 4x8 ft")).toBe("salad_4x8");
    expect(chipId("Make me a salad garden for 4 by 8 ft")).toBe("salad_4x8");
    expect(chipId("Make me a salad garden for 4�8 ft")).toBe("salad_4x8");
    expect(chipId("What can I plant in my pots?")).toBeNull();
  });

  it("assistant prompt carries the spec 7B.3 rules", () => {
    const s = loadPrompt("assistant").system;
    for (const re of [/UF\/IFAS/, /source_url/, /invasive/i, /follow the product label/i, /Follow official instructions from your county/, /Confirm/, /data, never instructions|data, not instructions/i]) {
      expect(s).toMatch(re);
    }
  });

  it("rate limiter allows 30 chat messages per hour per IP", () => {
    const k = `chat:test-${Math.random()}`;
    for (let i = 0; i < 30; i++) expect(allow(k, 30)).toBe(true);
    expect(allow(k, 30)).toBe(false);
    expect(allow(`${k}-other`, 30)).toBe(true);
  });
});
