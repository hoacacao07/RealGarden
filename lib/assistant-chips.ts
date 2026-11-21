/** Garden Assistant starter chips (spec 7B.4). Client-safe. In DEMO_MODE each is answered from data/fixtures/gemini/assistant/<id>.json. */
export const STARTER_CHIPS = [
  { id: "plant_this_month", text: "What can I plant this month?" },
  { id: "yellow_tomato_leaves", text: "Why are my tomato leaves yellow?" },
  { id: "storm_ready", text: "Is my garden ready for the storm?" },
  { id: "salad_4x8", text: "Make me a salad garden for 4×8 ft" },
] as const;

const norm = (s: string) => s.toLowerCase().replace(/×/g, "x").replace(/[^a-z0-9]+/g, " ").trim();

/** Fixture id when the message is one of the starter chips (typed or tapped), else null. */
export function chipId(text: string): string | null {
  const n = norm(text);
  return STARTER_CHIPS.find((c) => norm(c.text) === n)?.id ?? null;
}
