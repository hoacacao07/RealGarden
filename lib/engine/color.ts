/**
 * Color matching in CIELAB (D65).
 *   ΔE = √(ΔL² + Δa² + Δb²)          (CIE76)
 *   match c = max(0, 1 − ΔE/50)
 *   Nativeness N = 1.0 native to region, 0.85 other Florida native, 0.6 non-invasive non-native, 0 invasive
 *   S_color = S_site·(0.5 + 0.5c)·N
 * Harmony partners by LCh hue angle: complementary +180°, analogous ±30°, triadic ±120°.
 */
import type { Plant, Region } from "../types";

export type Lab = [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB hex → CIELAB (D65 white, 2° observer). */
export function hexToLab(hex: string): Lab {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: Lab, b: Lab): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export const colorMatch = (hexA: string, hexB: string) => Math.max(0, 1 - deltaE(hexToLab(hexA), hexToLab(hexB)) / 50);

/** LCh hue angle in degrees [0, 360). */
export function hueAngle(hex: string): number {
  const [, a, b] = hexToLab(hex);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return (h + 360) % 360;
}

export const chroma = (hex: string) => {
  const [, a, b] = hexToLab(hex);
  return Math.hypot(a, b);
};

export function nativeness(p: Plant, region: Region): number {
  if (p.invasive_status === "invasive") return 0;
  if (p.origin === "native") return p.regions.includes(region) ? 1 : 0.85;
  return 0.6;
}

export const colorScore = (siteScore: number, c: number, n: number) => siteScore * (0.5 + 0.5 * c) * n;

/** Best match of any flower color of the plant to the target (0..1). */
export function bestFlowerMatch(p: Plant, targetHex: string): { c: number; color: string | null } {
  let best = { c: 0, color: null as string | null };
  for (const fc of p.flower_colors) {
    const c = colorMatch(fc.hex, targetHex);
    if (c > best.c) best = { c, color: fc.name };
  }
  return best;
}

const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export type Harmony = "complementary" | "analogous" | "triadic";
export const HARMONY_OFFSETS: Record<Harmony, number[]> = { complementary: [180], analogous: [-30, 30], triadic: [-120, 120] };

/** Hue tolerance (degrees). Complementary is wider: LCh puts yellow (~88°) opposite blue-violet (~270°). */
export const HARMONY_TOLERANCE: Record<Harmony, number> = { complementary: 50, analogous: 30, triadic: 30 };

/** Is `hex` a harmony partner of `baseHex`? Greys never count. */
export function isHarmony(baseHex: string, hex: string, kind: Harmony, tolerance = HARMONY_TOLERANCE[kind]): boolean {
  if (chroma(hex) < 15 || chroma(baseHex) < 15) return false;
  const h0 = hueAngle(baseHex);
  const h = hueAngle(hex);
  return HARMONY_OFFSETS[kind].some((o) => angDiff(h, (h0 + o + 360) % 360) <= tolerance);
}

export function bloomOverlap(a: Pick<Plant, "bloom_months">, b: Pick<Plant, "bloom_months">): number[] {
  return a.bloom_months.filter((m) => b.bloom_months.includes(m)).sort((x, y) => x - y);
}

/** Simple color family for counting variety (red, orange, yellow, green, blue, purple, pink, white, neutral). */
export function colorFamily(hex: string): string {
  const [L] = hexToLab(hex);
  const C = chroma(hex);
  if (C < 18) return L > 75 ? "white" : "neutral";
  const h = hueAngle(hex);
  if (h < 20 || h >= 350) return "pink";
  if (h < 45) return "red";
  if (h < 70) return "orange";
  if (h < 105) return "yellow";
  if (h < 200) return "green";
  if (h < 290) return "blue";
  if (h < 330) return "purple";
  return "pink";
}

/** Which color a plant shows in a month: flower color in bloom, fruit color when fruiting, foliage otherwise. */
export function colorInMonth(p: Plant, month: number, canBloom = true): { hex: string; kind: "flower" | "fruit" | "foliage" } {
  if (canBloom && p.bloom_months.includes(month) && p.flower_colors.length) return { hex: p.flower_colors[0].hex, kind: "flower" };
  if (canBloom && p.fruit_months.includes(month) && p.fruit_colors.length) return { hex: p.fruit_colors[0].hex, kind: "fruit" };
  return { hex: p.foliage_color, kind: "foliage" };
}
