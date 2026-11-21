import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

/** Prisma client singleton (survives Next.js hot reloads in dev). Created on first use, so importing is free. */
const g = globalThis as unknown as { prisma?: PrismaClient; prismaCtor?: unknown };

function make() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection.");
  // DB_POOL_MAX=1 for the local `prisma dev` server (PGlite handles one connection at a time); Supabase keeps 5.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX) || 5 }) });
}

function client(): PrismaClient {
  // After `prisma generate` + hot reload the class is new: rebuild so new models exist (dev only matters).
  if (!g.prisma || g.prismaCtor !== PrismaClient) {
    void g.prisma?.$disconnect().catch(() => undefined);
    g.prisma = make();
    g.prismaCtor = PrismaClient;
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
