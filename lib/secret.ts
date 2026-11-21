import { timingSafeEqual } from "node:crypto";

/** Constant-time compare of a provided secret with an env var. False when either is missing. */
export function secretOk(given: string | null | undefined, want: string | undefined): boolean {
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
