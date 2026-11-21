import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use the direct (non-pooled) Supabase connection; the app uses DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://localhost:5432/placeholder",
    // Only needed with `prisma dev` (single-database local server): point it at the server's shadow port.
    ...(process.env.SHADOW_DATABASE_URL && { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }),
  },
});
