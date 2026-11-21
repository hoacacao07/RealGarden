/**
 * Balcony weight check (Phase 11.5). Wet potting mix is heavy.
 *   load (kg) = Σ ( V_pot (L) × wet_mix_density + pot weight + water in the saucer )
 * All constants are estimates (BALCONY_CONFIG). We never say a balcony is safe: above the threshold we suggest asking
 * the building manager about the balcony's weight limit.
 */
import { BALCONY_CONFIG, L_PER_GAL } from "./containerWater";

export const KG_TO_LB = 2.20462;

export interface WeightResult {
  kg: number;
  lb: number;
  pots: number;
  over_threshold: boolean;
  note: string;
}

export function potWeightKg(gal: number, cfg = BALCONY_CONFIG): number {
  return gal * L_PER_GAL * cfg.wet_mix_kg_per_l + gal * cfg.pot_kg_per_gal + gal * cfg.saucer_l_per_gal;
}

export function balconyWeight(gallons: number[], cfg = BALCONY_CONFIG): WeightResult {
  const kg = gallons.reduce((s, g) => s + potWeightKg(g, cfg), 0);
  const lb = kg * KG_TO_LB;
  const over = lb > cfg.weight_note_lb;
  return {
    kg: Math.round(kg), lb: Math.round(lb), pots: gallons.length, over_threshold: over,
    note: over
      ? "That's a lot of wet soil. Ask your building manager about balcony weight limits before adding more."
      : "An estimate of wet pots, soil and saucer water. We can't tell you what your balcony can hold; your building manager can.",
  };
}
