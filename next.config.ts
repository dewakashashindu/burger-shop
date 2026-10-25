import type { NextConfig } from "next";
import { hostname, networkInterfaces } from "node:os";

// Next 16 checks the dev HMR WebSocket origin before starting client hydration.
// Include THIS computer's LAN addresses, not only localhost / the Arena preview.
// This works for a changing Wi-Fi address on Windows, macOS and Linux.
const localIPv4Addresses = Object.values(networkInterfaces()).flatMap(
  (interfaces) =>
    interfaces
      ?.filter((entry) => entry.family === "IPv4")
      .map((entry) => entry.address) ?? [],
);
const extraDevHosts = (process.env.DEV_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...new Set([
      "localhost",
      "127.0.0.1",
      hostname().toLowerCase(),
      "*.e2b.app",
      ...localIPv4Addresses,
      ...extraDevHosts,
    ]),
  ],
  // Prerendered pages are served with `Cache-Control: s-maxage=31536000`, so a
  // shared cache — the Arena / E2B preview proxy, a CDN, or a company proxy —
  // will happily keep serving the previous build for a year. HTML and RSC
  // payloads must always revalidate instead. Hashed files under /_next/static
  // and the photographs in /public keep their long-lived caching, because they
  // are requested by name and never change under the same name.
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "X-Mila-Build", value: "video-card-14" },
    ];
    const media = [
      {
        key: "Cache-Control",
        value: "public, max-age=86400, stale-while-revalidate=604800",
      },
    ];
    // Prefetch payloads (`?_rsc=…`) are already keyed by a build-specific hash
    // and are left alone: forcing no-store on them makes Chromium cancel the
    // in-flight prefetch stream, so client-side navigation loses its warm cache.
    const documentsOnly = { missing: [{ type: "query" as const, key: "_rsc" }] };
    return [
      { source: "/", headers: noStore, ...documentsOnly },
      // The hero clip is requested by three panes at once; a day of caching
      // means the browser downloads it once and reuses the same bytes.
      { source: "/hero.mp4", headers: media },
      {
        source:
          "/:path((?!_next/|images/|fonts/|.*\\.(?:mp4|webm|png|jpe?g|svg|webp|ico|woff2?|ttf|otf|json|txt|xml|webmanifest)$).*)",
        headers: noStore,
        ...documentsOnly,
      },
    ];
  },
  // The SQL driver stays outside the bundle and is loaded at runtime.
  serverExternalPackages: ["mssql"],
  experimental: {
    agentFeedback: true,
  },
  // Both cacheComponents and partialPrefetching leave the previous page's
  // <div class="app-shell"> in the DOM on a client-side route change: the header,
  // footer and "Order now" pill pile up one screen behind another and the top
  // copy still links to the old page. Off, every route swaps cleanly.
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
