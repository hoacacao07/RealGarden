import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

/** Prisma client singleton (survives Next.js hot reloads in dev). Created on first use, so importing is free. */
const g = globalThis as unknown as { prisma?: PrismaClient };

function make() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

function client(): PrismaClient {
  if (!g.prisma) g.prisma = make();
  return g.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = client();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
