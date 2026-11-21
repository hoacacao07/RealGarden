/** Display helpers shared across pages (pure, unit tested). */

export const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function label(s: string): string {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function mmToIn(mm: number, digits = 2): string {
  return (mm / 25.4).toFixed(digits);
}

export function gallons(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function range(r: number[], unit = "ft"): string {
  return r[0] === r[1] ? `${r[0]} ${unit}` : `${r[0]}–${r[1]} ${unit}`;
}

/** Day label from an ISO date without timezone drift ("2025-01-21" -> "Tue 21"). */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()]} ${d}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}`;
}

export const SEVERITY_STYLE: Record<string, string> = {
  high: "border-coral bg-coral/10 text-[oklch(0.45_0.15_30)]",
  medium: "border-[oklch(0.75_0.13_70)] bg-[oklch(0.96_0.05_85)] text-[oklch(0.42_0.09_60)]",
  low: "border-sky bg-accent text-accent-foreground",
};

export const THEMES = [
  { id: "seaside", title: "Seaside", blurb: "Salt spray and sandy soil near the coast." },
  { id: "water", title: "Water / Rain garden", blurb: "Low spots that collect runoff after storms." },
  { id: "wildlife", title: "Wildlife & Butterfly", blurb: "Nectar, host plants and berries for birds." },
  { id: "custom", title: "Custom", blurb: "No theme. Rank purely on site fit." },
] as const;
