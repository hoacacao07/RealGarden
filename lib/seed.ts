/** Seeding shared by `prisma db seed` and POST /api/demo/reset. Idempotent. */
import ediblesJson from "../data/edibles.json";
import linh from "../data/demo/linh.json";
import maria from "../data/demo/maria.json";
import reports from "../data/demo/reports.json";
import plantsJson from "../data/plants.json";
import { Prisma, type PrismaClient } from "./generated/prisma/client";
import type { Plant } from "./types";

/** Natives and non-natives (plants.json) plus edible crops (edibles.json, origin "edible"). */
const PLANTS = [...(plantsJson as unknown as Plant[]), ...(ediblesJson.plants as unknown as Plant[])];
const COLUMNS = ["id", "common_name", "scientific_name", "category", "form", "origin", "invasive_status", "regions", "light", "salt_tolerance", "water_need", "verified"] as const;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

export async function seedPlants(db: PrismaClient) {
  for (const p of PLANTS) {
    const cols = Object.fromEntries(COLUMNS.map((k) => [k, p[k]])) as Record<(typeof COLUMNS)[number], never>;
    const attrs = Object.fromEntries(Object.entries(p).filter(([k]) => !(COLUMNS as readonly string[]).includes(k)));
    await db.plant.upsert({ where: { id: p.id }, create: { ...cols, attrs }, update: { ...cols, attrs } });
  }
  // Drop plants removed from plants.json (only if nothing references them).
  await db.plant.deleteMany({
    where: { id: { notIn: PLANTS.map((p) => p.id) }, placements: { none: {} }, checkins: { none: {} }, reports: { none: {} } },
  });
  return PLANTS.length;
}

interface Persona {
  site: Record<string, unknown> & { id: string; rules?: unknown };
  garden: { id: string; name: string; theme: string | null; planted_days_ago: number; canvas_w_ft: number; canvas_h_ft: number; starter: { goals: string[]; hours_week: string; space: string } };
  zones: { id: string; name: string; irrigation: string; polygon: number[][]; kind?: string; bed?: string; depth_in?: number }[];
  placements: { plant_id: string; zone?: string; x_ft: number; y_ft: number; days_ago: number; group?: string; gal?: number; mount?: string }[];
}

/** Delete and recreate a demo persona's site, garden, zones and placements (cascades remove their check-ins). */
async function seedPersona(db: PrismaClient, d: Persona) {
  await db.garden.deleteMany({ where: { id: d.garden.id } });
  await db.site.deleteMany({ where: { id: d.site.id } });
  const { rules, ...site } = d.site;
  await db.site.create({ data: { ...(site as Prisma.SiteCreateInput), rules: rules == null ? Prisma.DbNull : (rules as Prisma.InputJsonValue) } });
  await db.garden.create({
    data: {
      id: d.garden.id, site_id: d.site.id, name: d.garden.name, theme: d.garden.theme,
      planted_on: daysAgo(d.garden.planted_days_ago), canvas_w_ft: d.garden.canvas_w_ft,
      canvas_h_ft: d.garden.canvas_h_ft, is_demo: true,
      goals: d.garden.starter.goals, hours_week: d.garden.starter.hours_week, space: d.garden.starter.space,
      zones: {
        create: d.zones.map((z) => ({
          id: z.id, name: z.name, irrigation: z.irrigation, polygon: z.polygon,
          kind: z.kind ?? "landscape", bed: z.bed ?? null, depth_in: z.depth_in ?? null,
        })),
      },
    },
  });
  // A balcony has one zone; its pots belong to it.
  const only = d.zones.length === 1 ? d.zones[0].id : null;
  await db.placement.createMany({
    data: d.placements.map((p) => ({
      garden_id: d.garden.id, plant_id: p.plant_id, zone_id: p.zone ?? only, x_ft: p.x_ft, y_ft: p.y_ft,
      group_id: p.group ?? null, planted_on: daysAgo(p.days_ago), container_gal: p.gal ?? null, mount: p.mount ?? null,
    })),
  });
}

/** Maria: South Tampa front yard (Phases 1 to 11). */
export const seedMaria = (db: PrismaClient) => seedPersona(db, maria as Persona);
/** Linh: 4th-floor west balcony near USF (Phase 11.5). */
export const seedLinh = (db: PrismaClient) => seedPersona(db, linh as Persona);

/** Replace sample reports (dates re-based to now). Real shared check-in reports are kept. */
export async function seedReports(db: PrismaClient) {
  await db.report.deleteMany({ where: { is_sample: true } });
  await db.report.createMany({
    data: reports.reports.map((r) => ({
      issue_key: r.issue_key, label: r.label, host_plant_id: r.host_plant_id, lat_rounded: r.lat, lon_rounded: r.lon,
      is_sample: true, created_at: daysAgo(r.days_ago),
    })),
  });
  return reports.reports.length;
}

export async function seedAll(db: PrismaClient) {
  const n = await seedPlants(db);
  await seedMaria(db);
  await seedLinh(db);
  const r = await seedReports(db);
  return { plants: n, reports: r, gardens: [maria.garden.id, linh.garden.id] };
}
