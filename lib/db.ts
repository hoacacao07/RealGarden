import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

/** Prisma client singleton (survives Next.js hot reloads in dev). */
const g = globalThis as unknown as { prisma?: PrismaClient };

function make() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 5 }) });
}

export const prisma: PrismaClient = g.prisma ?? make();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
