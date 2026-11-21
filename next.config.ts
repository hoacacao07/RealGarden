import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

/**
 * Dev only: let phones and other computers on the same Wi-Fi open the dev server by this machine's IP
 * (http://<ip>:3000). Next 16 blocks dev resources from other hosts by default, which leaves the page
 * un-hydrated: it renders, but no button (Ask Garden AI included) works.
 */
const lanHosts = Object.values(networkInterfaces()).flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanHosts, "*.local"],
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
