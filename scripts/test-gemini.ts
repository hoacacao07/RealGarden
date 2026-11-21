/**
 * Smoke test (spec 3B.7): one structured Gemini call, printed. Uses .env / .env.local.
 *   npx tsx scripts/test-gemini.ts
 * Forces DEMO_MODE=false so it really calls the API (needs GEMINI_API_KEY and GEMINI_MODEL).
 */
import "dotenv/config";

import { z } from "zod";

import { generateJSON, hasKey } from "../lib/ai/gemini";
import { memoryStore } from "../lib/ai/store";
import { __setAi } from "../lib/ai/gemini";

process.env.DEMO_MODE = "false";
__setAi({ store: memoryStore() });

async function main() {
  if (!hasKey()) {
    console.error("Set GEMINI_API_KEY and GEMINI_MODEL in .env first (model name from Google AI Studio, latest stable Flash).");
    process.exit(1);
  }
  const t0 = Date.now();
  const out = await generateJSON({
    task: "plant_blurb" as never, // any task id works for a smoke test; the prompt file supplies the safety block
    model: "lite",
    cache: false,
    prompt: "Return JSON with three Florida-friendly herbs for a sunny balcony and one short reason each.",
    schema: z.object({ herbs: z.array(z.object({ name: z.string(), reason: z.string() })).min(1) }),
    responseSchema: {
      type: "object",
      properties: { herbs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } } },
      required: ["herbs"],
    },
  });
  console.log(JSON.stringify(out, null, 2));
  console.log(`OK in ${Date.now() - t0} ms with ${process.env.GEMINI_MODEL_LITE || process.env.GEMINI_MODEL}`);
}

main().catch((e) => {
  console.error("Gemini smoke test failed:", e.message);
  process.exit(1);
});
