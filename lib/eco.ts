/** Server side of the Sustainable section: load and save the eco layer, build the report, apply swaps. */
import { prisma } from "./db";
import { getGarden, getPlants } from "./data";
import { applySwap, ecoReport, greenerSwaps, lawnYard, type EcoReport, type Swap, type SwapAction } from "./engine/eco/report";
import { Prisma } from "./generated/prisma/client";
import { EMPTY_ECO, type EcoLayer, type GardenDoc, type Plant } from "./types";

export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export function normalizeEco(v: unknown): EcoLayer {
  const e = (v && typeof v === "object" ? v : {}) as Partial<EcoLayer>;
  return { ...EMPTY_ECO, ...e, surfaces: Array.isArray(e.surfaces) ? e.surfaces : [] };
}

export async function getEco(gardenId: string): Promise<{ eco: EcoLayer; seen: Record<string, number | null> | null }> {
  const g = await prisma.garden.findUnique({ where: { id: gardenId }, select: { eco: true, eco_seen: true } });
  return { eco: normalizeEco(g?.eco), seen: (g?.eco_seen as Record<string, number | null> | null) ?? null };
}

export const saveEco = (gardenId: string, eco: EcoLayer) =>
  prisma.garden.update({ where: { id: gardenId }, data: { eco: eco as unknown as Prisma.InputJsonValue } });

export const saveSeen = (gardenId: string, seen: Record<string, number | null>) =>
  prisma.garden.update({ where: { id: gardenId }, data: { eco_seen: seen as Prisma.InputJsonValue } });

export interface EcoBundle { garden: GardenDoc; plants: Plant[]; eco: EcoLayer; report: EcoReport; swaps: Swap[]; seen: Record<string, number | null> | null }

export async function ecoBundle(gardenId: string): Promise<EcoBundle | null> {
  const [garden, plants, e] = await Promise.all([getGarden(gardenId), getPlants(), getEco(gardenId)]);
  if (!garden) return null;
  const x = { garden, plants, eco: e.eco, today: todayIso() };
  const report = ecoReport(x);
  return { garden, plants, eco: e.eco, report, swaps: greenerSwaps(x, report), seen: e.seen };
}

/** Report card: year 1, 5 and 10, and the same yard as a typical lawn. */
export function reportCard(b: Pick<EcoBundle, "garden" | "plants" | "eco">) {
  const x = { garden: b.garden, plants: b.plants, eco: b.eco, today: todayIso() };
  return { years: [1, 5, 10].map((y) => ({ year: y, report: ecoReport({ ...x, yearsAhead: y }) })), lawn: lawnYard(x) };
}

/** Apply one of the currently suggested swaps (looked up by id, so the client can't send arbitrary edits). */
export async function applySwapById(gardenId: string, swapId: string): Promise<{ ok: true; swap: Swap } | { ok: false; error: string }> {
  const b = await ecoBundle(gardenId);
  if (!b) return { ok: false, error: "Garden not found" };
  const swap = b.swaps.find((s) => s.id === swapId);
  if (!swap) return { ok: false, error: "That swap is no longer suggested. Refresh the page." };
  await persist(b, swap.action);
  return { ok: true, swap };
}

async function persist(b: EcoBundle, a: SwapAction) {
  const next = applySwap(b.garden, b.eco, a);
  switch (a.type) {
    case "replace_plant":
      await prisma.placement.updateMany({ where: { garden_id: b.garden.id, plant_id: a.from }, data: { plant_id: a.to } });
      break;
    case "move":
      await prisma.placement.updateMany({ where: { id: a.placement_id, garden_id: b.garden.id }, data: { x_ft: a.x_ft, y_ft: a.y_ft } });
      break;
    case "add_plant":
      await prisma.placement.createMany({
        data: a.spots.map((s) => ({ garden_id: b.garden.id, plant_id: a.plant_id, zone_id: s.zone_id, x_ft: s.x_ft, y_ft: s.y_ft, planted_on: new Date(todayIso() + "T12:00:00Z"), group_id: "eco_swap" })),
      });
      break;
    default:
      await saveEco(b.garden.id, next.eco);
  }
  await prisma.garden.update({ where: { id: b.garden.id }, data: { updated_at: new Date() } });
}
