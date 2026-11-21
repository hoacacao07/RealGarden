/**
 * Coefficients for the eco engines, all from data/sustainability.json (value, unit, source_url, note, verified).
 * The "How we calculate this" popovers list these entries next to each formula.
 */
import json from "../../../data/sustainability.json";

export interface Coef<T = number> { value: T; unit: string; source_url: string; note: string; verified: boolean }

type Table = typeof json.coefficients;
export type CoefKey = keyof Table;

export const COEF = json.coefficients as unknown as { [K in CoefKey]: Coef<Table[K]["value"]> };
export const C = <K extends CoefKey>(k: K): Table[K]["value"] => COEF[k].value;

export const CLIMATE = json.climate;

/** Coefficient entries for a popover, by key. */
export const coefRefs = (...keys: CoefKey[]) => keys.map((k) => ({ key: k, ...COEF[k] }));

/** 1 mm over 1 ft² ≈ 0.0245 gal (spec 6D.3: 0.623 / 25.4). */
export const galPerMmSqft = () => C("gal_per_inch_sqft") / 25.4;
export const mmToGallons = (mm: number, sqft: number) => mm * sqft * galPerMmSqft();
export const inchesToGallons = (inches: number, sqft: number) => inches * sqft * C("gal_per_inch_sqft");
