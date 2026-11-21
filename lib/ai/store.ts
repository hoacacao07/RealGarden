/** AiCache (24 h results) and AiLog (one row per call) in Postgres. Every method is best effort. */
import { prisma } from "../db";
import type { Prisma } from "../generated/prisma/client";

export interface AiLogEntry {
  task: string;
  model: string;
  latency_ms: number;
  in_tokens?: number;
  out_tokens?: number;
  cache_hit: boolean;
  error: string | null;
}

export interface AiStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, task: string, value: unknown, ttlMs: number): Promise<void>;
  log(e: AiLogEntry): Promise<void>;
}

export const defaultStore: AiStore = {
  async get(key) {
    const r = await prisma.aiCache.findUnique({ where: { key } });
    if (!r || r.expires_at < new Date()) return null;
    return r.value;
  },
  async set(key, task, value, ttlMs) {
    const expires_at = new Date(Date.now() + ttlMs);
    const v = value as Prisma.InputJsonValue;
    await prisma.aiCache.upsert({ where: { key }, create: { key, task, value: v, expires_at }, update: { value: v, expires_at } });
  },
  async log(e) {
    await prisma.aiLog.create({ data: { ...e, in_tokens: e.in_tokens ?? null, out_tokens: e.out_tokens ?? null } });
  },
};

/** In-memory store for tests and scripts. */
export function memoryStore() {
  const kv = new Map<string, unknown>();
  const logs: AiLogEntry[] = [];
  const s: AiStore & { logs: AiLogEntry[]; kv: Map<string, unknown> } = {
    logs, kv,
    async get(k) { return kv.get(k) ?? null; },
    async set(k, _t, v) { kv.set(k, v); },
    async log(e) { logs.push(e); },
  };
  return s;
}

/** Counts for the presenter page. */
export async function aiStats() {
  const since = new Date(Date.now() - 7 * 86400e3);
  const rows = await prisma.aiLog.groupBy({ by: ["task"], where: { created_at: { gte: since } }, _count: { _all: true }, _avg: { latency_ms: true }, _sum: { in_tokens: true, out_tokens: true } });
  const errors = await prisma.aiLog.groupBy({ by: ["task"], where: { created_at: { gte: since }, error: { not: null } }, _count: { _all: true } });
  const hits = await prisma.aiLog.groupBy({ by: ["task"], where: { created_at: { gte: since }, cache_hit: true }, _count: { _all: true } });
  const n = (xs: { task: string; _count: { _all: number } }[], t: string) => xs.find((x) => x.task === t)?._count._all ?? 0;
  return rows.map((r) => ({
    task: r.task, calls: r._count._all, errors: n(errors, r.task), cache_hits: n(hits, r.task),
    avg_ms: Math.round(r._avg.latency_ms ?? 0), tokens: (r._sum.in_tokens ?? 0) + (r._sum.out_tokens ?? 0),
  }));
}
