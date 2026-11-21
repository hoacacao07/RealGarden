/**
 * Shared pattern for every external call: if DEMO_MODE (default true) or the key is missing, return the
 * fixture. Otherwise call live with a 6-second timeout and fall back to the fixture on any error.
 * Logs which one was used.
 */
import fs from "node:fs";
import path from "node:path";

import type { Source } from "../types";

export const demoMode = () => (process.env.DEMO_MODE ?? "true").toLowerCase() !== "false";

const DATA = path.join(process.cwd(), "data");

export function readData<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8")) as T;
}

export const fixture = <T>(name: string): T => readData<T>(path.join("fixtures", name));

export async function liveOrFixture<T>(
  name: string, opts: { needs?: (string | undefined)[]; live: (signal: AbortSignal) => Promise<T>; fallback: () => T | Promise<T> },
): Promise<{ data: T; source: Source }> {
  const missing = (opts.needs ?? []).some((v) => !v);
  if (demoMode() || missing) {
    console.info(`[${name}] fixture (${demoMode() ? "DEMO_MODE" : "no key"})`);
    return { data: await opts.fallback(), source: "fixture" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const data = await opts.live(ctrl.signal);
    console.info(`[${name}] live`);
    return { data, source: "live" };
  } catch (e) {
    console.warn(`[${name}] live call failed, using fixture:`, (e as Error).message);
    return { data: await opts.fallback(), source: "fixture" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit & { signal: AbortSignal }): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Tiny in-memory TTL cache (per server instance). */
const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}
