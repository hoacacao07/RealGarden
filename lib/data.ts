/** Server-side data access. Pages and route handlers use these; the browser never talks to Postgres. */
import { randomBytes } from "node:crypto";

import { prisma } from "./db";
import { Prisma } from "./generated/prisma/client";
import type { BalconyRules, GardenDoc, Goal, Mount, PlacementInput, Plant, ReportPoint, SiteInput, StarterAnswers, Theme, ZoneInput } from "./types";

type PlantRow = Prisma.PlantGetPayload<object>;

export function rowToPlant(r: PlantRow): Plant {
  const attrs = (r.attrs ?? {}) as Record<string, unknown>;
  return {
    ...(attrs as unknown as Plant),
    id: r.id, common_name: r.common_name, scientific_name: r.scientific_name, category: r.category as Plant["category"],
    form: r.form as Plant["form"], origin: r.origin as Plant["origin"], invasive_status: r.invasive_status as Plant["invasive_status"],
    regions: r.regions as Plant["regions"], light: r.light as Plant["light"], salt_tolerance: r.salt_tolerance as Plant["salt_tolerance"],
    water_need: r.water_need as Plant["water_need"], verified: r.verified,
  };
}

let plantCache: { at: number; plants: Plant[] } | null = null;

/** All plants, cached in memory for 60 s (the catalog only changes on re-seed). */
export async function getPlants(): Promise<Plant[]> {
  if (plantCache && Date.now() - plantCache.at < 60_000) return plantCache.plants;
  const rows = await prisma.plant.findMany({ orderBy: { common_name: "asc" } });
  plantCache = { at: Date.now(), plants: rows.map(rowToPlant) };
  return plantCache.plants;
}

export async function getPlant(id: string): Promise<Plant | null> {
  return (await getPlants()).find((p) => p.id === id) ?? null;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getGarden(id: string): Promise<GardenDoc | null> {
  const g = await prisma.garden.findUnique({
    where: { id },
    include: { site: true, zones: { orderBy: { name: "asc" } }, placements: { orderBy: [{ y_ft: "asc" }, { x_ft: "asc" }] } },
  });
  if (!g) return null;
  return {
    id: g.id, name: g.name, theme: (g.theme as Theme) ?? null, planted_on: isoDate(g.planted_on),
    canvas_w_ft: g.canvas_w_ft, canvas_h_ft: g.canvas_h_ft, is_demo: g.is_demo, updated_at: g.updated_at.toISOString(),
    starter: {
      goals: g.goals as Goal[], hours_week: g.hours_week as StarterAnswers['hours_week'], budget_usd: g.budget_usd,
      space: g.space as StarterAnswers['space'], target_harvest: g.target_harvest ? isoDate(g.target_harvest) : null,
    },
    site: {
      id: g.site.id, name: g.site.name, lat: g.site.lat, lon: g.site.lon, zip: g.site.zip, region: g.site.region as SiteInput["region"],
      sun: g.site.sun as SiteInput["sun"], soil: g.site.soil as SiteInput["soil"], drainage: g.site.drainage as SiteInput["drainage"],
      coastal_distance_mi: g.site.coastal_distance_mi, area_sqft: g.site.area_sqft, native_target_pct: g.site.native_target_pct,
      soil_source: g.site.soil_source as SiteInput["soil_source"], survey_name: g.site.survey_name, component: g.site.component,
      drainage_class: g.site.drainage_class, sand_pct: g.site.sand_pct, clay_pct: g.site.clay_pct, om_pct: g.site.om_pct,
      ph: g.site.ph, awc: g.site.awc, is_fill: g.site.is_fill,
      kind: g.site.kind as SiteInput["kind"], facing_deg: g.site.facing_deg, floor_level: g.site.floor_level, balcony_l_ft: g.site.balcony_l_ft,
      balcony_w_ft: g.site.balcony_w_ft, railing_ft: g.site.railing_ft, overhang_depth_ft: g.site.overhang_depth_ft,
      overhang_height_ft: g.site.overhang_height_ft, rules: (g.site.rules as BalconyRules | null) ?? null,
    },
    zones: g.zones.map((z) => ({
      id: z.id, name: z.name, polygon: z.polygon as [number, number][], irrigation: z.irrigation as ZoneInput["irrigation"],
      kind: z.kind as ZoneInput["kind"], bed: z.bed as ZoneInput["bed"], depth_in: z.depth_in,
    })),
    placements: g.placements.map((p) => ({
      id: p.id, plant_id: p.plant_id, zone_id: p.zone_id, x_ft: p.x_ft, y_ft: p.y_ft, group_id: p.group_id, planted_on: isoDate(p.planted_on),
      container_gal: p.container_gal, mount: p.mount as Mount | null,
    })),
  };
}

/** URL-safe short id, e.g. "k3f9x2qa". */
export function shortId(n = 8): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(n)].map((b) => alphabet[b % alphabet.length]).join("");
}

export interface GardenSave {
  name: string;
  theme: Theme | null;
  planted_on: string;
  canvas_w_ft: number;
  canvas_h_ft: number;
  site: SiteInput;
  starter?: StarterAnswers;
  zones: ZoneInput[];
  placements: PlacementInput[];
}

const day = (iso: string) => new Date(iso + "T12:00:00Z");

/** Site row data: balcony rules are JSON (null → SQL NULL). */
const siteData = (site: SiteInput) => ({ ...site, rules: site.rules ? (site.rules as unknown as Prisma.InputJsonValue) : Prisma.DbNull });

const starterData = (a: StarterAnswers) => ({
  goals: a.goals, hours_week: a.hours_week, budget_usd: a.budget_usd, space: a.space,
  target_harvest: a.target_harvest ? day(a.target_harvest) : null,
});

/** Create a garden with its site, zones and placements. Returns the new id. */
export async function createGarden(body: GardenSave): Promise<string> {
  const id = shortId();
  const site = await prisma.site.create({ data: { ...siteData(body.site), name: body.site.name ?? body.name } });
  await prisma.garden.create({
    data: {
      id, site_id: site.id, name: body.name, theme: body.theme, planted_on: day(body.planted_on),
      canvas_w_ft: body.canvas_w_ft, canvas_h_ft: body.canvas_h_ft,
      ...(body.starter && starterData(body.starter)),
    },
  });
  await replaceLayout(id, body.zones, body.placements);
  return id;
}

/**
 * Replace zones and placements in one transaction. Zone ids are always minted here (they are global
 * primary keys); placements that pointed at a client zone id are remapped to the new id.
 */
async function replaceLayout(gardenId: string, zones: ZoneInput[], placements: PlacementInput[]) {
  const zoneIds = zones.map(() => `z_${shortId(12)}`);
  const remap = new Map(zones.map((z, i) => [z.id ?? `#${i}`, zoneIds[i]]));
  await prisma.$transaction([
    prisma.placement.deleteMany({ where: { garden_id: gardenId } }),
    prisma.zone.deleteMany({ where: { garden_id: gardenId } }),
    prisma.zone.createMany({
      data: zones.map((z, i) => ({
        id: zoneIds[i], garden_id: gardenId, name: z.name, polygon: z.polygon, irrigation: z.irrigation,
        kind: z.kind ?? "landscape", bed: z.bed ?? null, depth_in: z.depth_in ?? null,
      })),
    }),
    prisma.placement.createMany({
      data: placements.map((p) => ({
        garden_id: gardenId, plant_id: p.plant_id, zone_id: (p.zone_id && remap.get(p.zone_id)) || null,
        x_ft: p.x_ft, y_ft: p.y_ft, group_id: p.group_id ?? null, planted_on: day(p.planted_on),
        container_gal: p.container_gal ?? null, mount: p.mount ?? null,
      })),
    }),
  ]);
}

export async function updateGarden(id: string, body: Partial<GardenSave>): Promise<boolean> {
  const g = await prisma.garden.findUnique({ where: { id } });
  if (!g) return false;
  await prisma.garden.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.theme !== undefined && { theme: body.theme }),
      ...(body.canvas_w_ft !== undefined && { canvas_w_ft: body.canvas_w_ft }),
      ...(body.canvas_h_ft !== undefined && { canvas_h_ft: body.canvas_h_ft }),
      ...(body.starter && starterData(body.starter)),
      updated_at: new Date(),
    },
  });
  if (body.site) {
    const { name, ...rest } = siteData(body.site);
    await prisma.site.update({ where: { id: g.site_id }, data: { ...rest, ...(name && { name }) } });
  }
  if (body.zones && body.placements) await replaceLayout(id, body.zones, body.placements);
  return true;
}

/**
 * Disease reports for the map and engine. Sample reports are re-based so the newest one is two days old;
 * otherwise the 21-day cluster window would empty out a few weeks after seeding (see README, Demo shortcuts).
 */
export async function getReports(): Promise<ReportPoint[]> {
  const rows = await prisma.report.findMany({ orderBy: { created_at: "desc" }, take: 500 });
  const samples = rows.filter((r) => r.is_sample);
  const newest = samples.length ? Math.max(...samples.map((r) => r.created_at.getTime())) : 0;
  const shift = newest ? Math.max(0, Date.now() - 2 * 86400e3 - newest) : 0;
  return rows.map((r) => ({
    id: r.id, issue_key: r.issue_key, label: r.label, host_plant_id: r.host_plant_id, lat: r.lat_rounded, lon: r.lon_rounded,
    is_sample: r.is_sample, created_at: new Date(r.created_at.getTime() + (r.is_sample ? shift : 0)).toISOString(),
  }));
}
