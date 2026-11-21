import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data files under data/ are read at runtime by route handlers (scenarios, fixtures).
  // Demo check-in photos are read from public/ by the check-in routes, so they must be traced into the functions too.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*.json", "./public/demo-photos/*.jpg"],
    "/garden/**": ["./data/**/*.json"],
    "/": ["./data/**/*.json"],
  },
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
