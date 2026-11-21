/**
 * Frost risk per plant and night (°F).
 *   high   if forecast low ≤ cold_hardy_f
 *   medium if within 3°F of it (6°F for plants under 12 months old)
 *   low    otherwise
 */
export type Risk = "low" | "medium" | "high";
const RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

export function frostRisk(tminF: number, coldHardyF: number, young: boolean): Risk {
  if (tminF <= coldHardyF) return "high";
  if (tminF <= coldHardyF + (young ? 6 : 3)) return "medium";
  return "low";
}

export interface FrostPlant { id: string; name: string; cold_hardy_f: number; young: boolean }
export interface FrostNight {
  date: string;
  tmin_f: number;
  severity: Risk;
  affected: { id: string; name: string; risk: Risk; cold_hardy_f: number; young: boolean }[];
}

/** One result per night that puts at least one plant at medium or high risk. */
export function frostNights(nights: { date: string; tmin_f: number }[], plants: FrostPlant[]): FrostNight[] {
  const out: FrostNight[] = [];
  for (const n of nights) {
    const affected = plants
      .map((p) => ({ id: p.id, name: p.name, risk: frostRisk(n.tmin_f, p.cold_hardy_f, p.young), cold_hardy_f: p.cold_hardy_f, young: p.young }))
      .filter((a) => a.risk !== "low")
      .sort((a, b) => RANK[b.risk] - RANK[a.risk] || a.name.localeCompare(b.name));
    if (affected.length) {
      out.push({ date: n.date, tmin_f: n.tmin_f, severity: affected[0].risk, affected });
    }
  }
  return out;
}
