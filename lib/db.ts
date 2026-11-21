import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "./generated/prisma/client";

/** Prisma client singleton (survives Next.js hot reloads in dev). Created on first use, so importing is free. */
const g = globalThis as unknown as { prisma?: PrismaClient; prismaSchema?: string };

function make() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection.");
  // The local `prisma dev` server (PGlite) handles one connection at a time: a second one gets the first closed
  // mid-query (P1017 ConnectionClosed). So a localhost database defaults to 1 connection; Supabase keeps 5.
  // DB_POOL_MAX overrides both.
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
  const max = Number(process.env.DB_POOL_MAX) || (local ? 1 : 5);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

/**
 * Rebuild the client only when the schema's models change (after `prisma generate` + hot reload).
 * Not on every new PrismaClient class: in Turbopack dev each bundle (pages, route handlers) loads its own copy of the
 * class, and rebuilding per class made bundles close each other's connection mid-query (P1017 ConnectionClosed),
 * which broke pages whenever the alert banner or the chat called an API at the same time.
 */
const schema = Object.values(Prisma.ModelName).join(",");

function client(): PrismaClient {
  if (!g.prisma || g.prismaSchema !== schema) {
    void g.prisma?.$disconnect().catch(() => undefined);
    g.prisma = make();
    g.prismaSchema = schema;
  }
  return g.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = client();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
