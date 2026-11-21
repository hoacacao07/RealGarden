/**
 * Versioned prompts (spec 3B.4): prompts/<task>.md with a header
 *   ---
 *   task: diagnose
 *   version: 2
 *   model: main
 *   ---
 * then the system instruction and 2 to 3 examples. prompts/_safety.md is appended to every prompt.
 */
import fs from "node:fs";
import path from "node:path";

export interface Prompt { task: string; version: number; model: "main" | "lite"; system: string }

const cache = new Map<string, Prompt>();
const DIR = () => path.join(process.cwd(), "prompts");

export function parsePrompt(raw: string, safety: string): Prompt {
  const m = raw.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error("prompt file needs a --- header ---");
  const head = Object.fromEntries(m[1].split(/\r?\n/).map((l) => l.split(":").map((s) => s.trim())).filter((kv) => kv.length >= 2).map(([k, ...v]) => [k, v.join(":")]));
  return {
    task: head.task,
    version: Number(head.version) || 1,
    model: head.model === "lite" ? "lite" : "main",
    system: `${m[2].trim()}\n\n${safety.trim()}`,
  };
}

export function loadPrompt(task: string): Prompt {
  const hit = cache.get(task);
  if (hit) return hit;
  const safety = fs.readFileSync(path.join(DIR(), "_safety.md"), "utf8").replace(/^﻿/, "");
  const p = parsePrompt(fs.readFileSync(path.join(DIR(), `${task}.md`), "utf8"), safety);
  cache.set(task, p);
  return p;
}
