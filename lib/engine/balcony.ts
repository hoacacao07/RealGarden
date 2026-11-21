/**
 * Balcony mode rules (Phase 11.5) that sit on top of the other engines:
 *   - alert tasks: on wind, tropical or severe storm alerts the first task is always "Bring every pot, basket and
 *     trellis inside before the wind starts", ahead of everything else, with the safety line; heavy rain adds
 *     "empty saucers after the rain"
 *   - shopping lines: containers by size, potting mix bags (never garden soil), saucers, trellis, railing planters,
 *     fertilizer for edibles only, optional self-watering pots. Quantities only, no prices.
 *   - starter layout: 1 or 2 pollinator natives in pots next to 2 or 3 container edibles, sunniest spots by the railing
 */
import type { BalconyRules, Mount, Plant, PlacementInput, SiteInput, StarterAnswers, ZoneInput } from "../types";
import { cropPicks, pollinatorPicks } from "./starter";
import { nextPlantingDate } from "./edibles";
import { addDays } from "./geo";
import { FERTILIZER_NOTE, type ShopLine } from "./shopping";
import { L_PER_GAL, potDiameterIn } from "./containerWater";

export const BRING_INSIDE = "Bring every pot, basket and trellis inside before the wind starts";
export const SAFETY_LINE = "Follow official instructions from your county. Don't go outside during the storm.";
export const EMPTY_SAUCERS = "Empty saucers after the rain to stop mosquitoes";
export const SAUCER_REMINDER = "Use saucers so water doesn't drip onto balconies below";

const WIND = /tropical storm|hurricane|high wind|wind advisory|severe thunderstorm/i;
const RAIN = /flood|heavy rain|flash flood/i;

export const isBalconyWindAlert = (event: string) => WIND.test(event);

export interface AlertTaskList { safety: string | null; tasks: string[] }

/** Ordered pre-storm tasks for a balcony garden. Deterministic: Gemini may reword but never reorder. */
export function balconyAlertTasks(event: string): AlertTaskList {
  if (WIND.test(event)) {
    const tasks = [BRING_INSIDE, "Take down hanging baskets and railing planters", "Harvest anything ripe now", "Skip watering until the storm passes", "Don't fertilize or prune now"];
    if (RAIN.test(event) || /hurricane|tropical storm/i.test(event)) tasks.push(EMPTY_SAUCERS);
    return { safety: SAFETY_LINE, tasks };
  }
  if (RAIN.test(event)) {
    return { safety: /warning/i.test(event) ? SAFETY_LINE : null, tasks: ["Skip watering; pots outside the overhang will fill up", "Move pots back from the edge so overflow doesn't drip below", EMPTY_SAUCERS] };
  }
  return { safety: null, tasks: [] };
}

/** Pot sizes for the shopping list, from the placements (defaulting to each plant's minimum size). */
export function potGallons(placements: Pick<PlacementInput, "plant_id" | "container_gal">[], byId: Map<string, Plant>): number[] {
  return placements.map((p) => p.container_gal ?? byId.get(p.plant_id)?.min_container_gal ?? 3);
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function balconyShopping(placements: Pick<PlacementInput, "plant_id" | "container_gal" | "mount">[], byId: Map<string, Plant>, rules: BalconyRules | null | undefined, bagFt3 = 1.5): ShopLine[] {
  const lines: ShopLine[] = [];
  const pots = placements.map((p) => ({ p, plant: byId.get(p.plant_id), gal: p.container_gal ?? byId.get(p.plant_id)?.min_container_gal ?? 3 }));
  const floorPots = pots.filter((x) => (x.p.mount ?? "floor") === "floor");
  const bySize = new Map<number, number>();
  for (const x of floorPots) bySize.set(x.gal, (bySize.get(x.gal) ?? 0) + 1);
  for (const [gal, n] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push({ id: `pot:${gal}`, category: "containers", item: `${gal} gal pot with drainage holes`, qty: n, unit: n === 1 ? "pot" : "pots", note: `About ${potDiameterIn(gal)} in across` });
  }
  const railing = pots.filter((x) => x.p.mount === "railing").length;
  if (railing) lines.push({ id: "railing-planter", category: "containers", item: "Railing planter (hooks over the rail)", qty: Math.ceil(railing / 2), unit: "planters", note: "Holds about 2 small plants each" + (rules?.railing_pots == null ? ". Check your building allows pots on the railing" : "") });
  const hanging = pots.filter((x) => x.p.mount === "hanging").length;
  if (hanging) lines.push({ id: "hanging", category: "containers", item: "Hanging basket with hook", qty: hanging, unit: hanging === 1 ? "basket" : "baskets", note: rules?.hanging_baskets == null ? "Check your building allows hanging baskets" : undefined });

  const liters = pots.reduce((s, x) => s + x.gal * L_PER_GAL, 0);
  const ft3 = liters / 28.317;
  lines.push({ id: "potting-mix", category: "soil", item: "Bagged potting mix (never garden soil)", qty: Math.ceil(ft3 / bagFt3 - 1e-9), unit: `bags (${bagFt3} ft³)`, note: `${r1(ft3)} ft³ to fill ${pots.length} container${pots.length === 1 ? "" : "s"}`, volume_ft3: ft3 });
  if (floorPots.length) lines.push({ id: "saucers", category: "supplies", item: "Saucers", qty: floorPots.length, unit: "saucers", note: rules?.no_drip ? SAUCER_REMINDER : "One under every floor pot" });
  const trellis = pots.filter((x) => x.plant?.trellis).length;
  if (trellis) lines.push({ id: "trellis", category: "supplies", item: "Stake, cage or small trellis", qty: trellis, unit: "pieces", note: "For tomatoes and vines" });
  if (pots.some((x) => x.plant?.origin === "edible")) lines.push({ id: "fertilizer", category: "fertilizer", item: "Slow-release fertilizer for containers (edibles only)", qty: 1, unit: "bag", note: FERTILIZER_NOTE });
  lines.push({ id: "self-watering", category: "containers", item: "Self-watering pots instead of plain pots", qty: floorPots.length, unit: "pots", note: "Optional: helps on hot west and south balconies", optional: true });
  return lines;
}

/** The whole floor as one container zone (hand-watered). */
export function balconyZone(l: number, w: number): ZoneInput & { id: string } {
  return { id: "z_balcony", name: "Balcony pots", irrigation: "none", kind: "edible", bed: "container", depth_in: null, polygon: [[0, 0], [l, 0], [l, w], [0, w]] };
}

/**
 * Balcony starter: crops that grow in pots plus 1 or 2 pollinator natives (2 if butterflies is a goal).
 * Pots go in a row along the railing (y = pot radius + 0.3 ft), the sunniest strip; tomatoes get a trellis.
 */
export function balconyStarter(a: StarterAnswers, site: SiteInput, plants: Plant[], today: string) {
  const L = site.balcony_l_ft ?? 10;
  const W = site.balcony_w_ft ?? 5;
  const food = a.goals.includes("food") || !a.goals.length;
  const crops = food ? cropPicks(site, plants, today, 3, true, 0.5) : [];
  const nNative = a.goals.includes("butterflies") || a.goals.includes("flowers") || !food ? 2 : 1;
  const natives = pollinatorPicks(site, plants, nNative);
  const items: { plant: Plant; mount: Mount; gal: number; planted_on?: string }[] = [];
  for (const c of crops) {
    const n = c.id.includes("tomato") ? 2 : 1;
    const when = nextPlantingDate(c.edible?.planting_windows[site.region] ?? [], addDays(today, 14)) ?? undefined;
    for (let i = 0; i < n; i++) items.push({ plant: c, mount: "floor", gal: c.min_container_gal ?? 3, planted_on: when });
  }
  for (const nat of natives) items.push({ plant: nat, mount: "floor", gal: Math.max(3, nat.min_container_gal ?? 3) });

  const placements: (Omit<PlacementInput, "planted_on"> & { planted_on?: string })[] = [];
  let x = 0.3;
  let row = 0;
  for (const it of items) {
    const d = potDiameterIn(it.gal) / 12;
    if (x + d > L - 0.2) { x = 0.3; row++; }
    const y = 0.3 + d / 2 + row * 1.6;
    placements.push({
      plant_id: it.plant.id, x_ft: r1(x + d / 2), y_ft: r1(Math.min(W - d / 2, y)), zone_id: "z_balcony",
      container_gal: it.gal, mount: it.mount, planted_on: it.planted_on, group_id: it.plant.origin === "edible" ? `crop_${it.plant.id}` : "pollinator_pots",
    });
    x += d + 0.4;
  }
  return {
    name: "My balcony garden", theme: "wildlife" as const, canvas_w_ft: L, canvas_h_ft: W, zones: [balconyZone(L, W)], placements,
    crops: crops.map((c) => c.id), pollinators: natives.map((n) => n.id),
  };
}
