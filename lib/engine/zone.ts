/**
 * USDA plant hardiness zones (2023 map) used in Florida: zone → average extreme minimum winter temperature (°F, lower
 * bound of the half-zone band), available winter chill hours (rough placeholder for low-chill fruit filtering), and a
 * latitude fallback when the ZIP lookup fails.
 */
export const FL_ZONES = ["8a", "8b", "9a", "9b", "10a", "10b", "11a"] as const;
export type FlZone = (typeof FL_ZONES)[number];

/** 1a = -60°F, each half zone adds 5°F: 8a = 10, 9b = 25, 10a = 30, 11a = 40. */
export function zoneMinF(zone: string): number {
  const m = zone.match(/^(\d{1,2})([ab])$/);
  if (!m) return 25;
  return -60 + (Number(m[1]) - 1) * 10 + (m[2] === "b" ? 5 : 0);
}

/** Approximate chill hours (hours 32–45°F) per winter. Placeholder until the team adds a sourced table. */
const CHILL: Record<string, number> = { "8a": 650, "8b": 550, "9a": 450, "9b": 300, "10a": 250, "10b": 100, "11a": 25 };
export const chillHoursFor = (zone: string) => CHILL[zone] ?? 250;

/** Fallback when there is no ZIP lookup: rough Florida bands by latitude (labeled "estimate" in the UI). */
export function zoneForLat(lat: number): FlZone {
  if (lat >= 30.4) return "8b";
  if (lat >= 29.6) return "9a";
  if (lat >= 28.3) return "9b";
  if (lat >= 26.6) return "10a";
  if (lat >= 25.4) return "10b";
  return "11a";
}

export const zoneLabel = (zone: string) => `Zone ${zone} (winter lows ${zoneMinF(zone)} to ${zoneMinF(zone) + 5}°F)`;
