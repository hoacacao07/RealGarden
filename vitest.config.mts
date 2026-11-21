import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests cover the pure engines in lib/engine only.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
