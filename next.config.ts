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
      { key: "X-Mila-Build", value: "order-search-16" },
    ];
    // A year, and promised not to change: the hero clip's name carries a hash of
    // its own bytes, so a new clip is a new URL and this old one is never asked
    // for again. A returning visitor downloads zero bytes of video.
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    // The poster has no hash in its name, so it revalidates weekly instead — a
    // new still replaces the old one without waiting a year.
    const poster = [
      { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" },
    ];
    // Prefetch payloads (`?_rsc=…`) are already keyed by a build-specific hash
    // and are left alone: forcing no-store on them makes Chromium cancel the
    // in-flight prefetch stream, so client-side navigation loses its warm cache.
    const documentsOnly = { missing: [{ type: "query" as const, key: "_rsc" }] };
    return [
      { source: "/", headers: noStore, ...documentsOnly },
      // The hero clip hero-4c11bfba.mp4: 33 MB of video, served once and never again.
      // Rename the file (new hash) and update this line when the clip changes.
      { source: "/hero-4c11bfba.mp4", headers: immutable },
      { source: "/hero-poster.jpg", headers: poster },
      // The pre-hash name, for a browser still holding a page cached from
      // before the rename: same promise, so it is not re-downloaded either.
      { source: "/hero.mp4", headers: immutable },
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
  /**
   * Ship the SQL driver with the server output.
   *
   * `serverExternalPackages` only says "do not bundle mssql" — it does not copy
   * the package anywhere. The build's file tracer (@vercel/nft) follows real
   * import/require calls, and lib/db.ts loads the driver through an opaque
   * require whose name it cannot see, so nothing was traced and the Netlify
   * function was packaged without the driver at all. That is exactly what
   * /api/menu/health reported:
   *
   *   { "reason": "driver-missing",
   *     "diagnostics": { "cwd": "/var/task", "nodeModulesMssql": false } }
   *
   * These globs put the driver and its whole dependency tree (tedious, tarn and
   * tedious' own @azure/*, @js-joda, bl, iconv-lite …) into every server
   * function, so the runtime require finds it. On a normal machine the copy is
   * harmless duplication of what is already in node_modules.
   */
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/mssql/**",
      "./node_modules/tedious/**",
      "./node_modules/tarn/**",
      "./node_modules/@tediousjs/**",
      "./node_modules/@azure/**",
      "./node_modules/@js-joda/**",
      "./node_modules/bl/**",
      "./node_modules/iconv-lite/**",
      "./node_modules/js-md4/**",
      "./node_modules/native-duplexpair/**",
      "./node_modules/readable-stream/**",
      "./node_modules/sprintf-js/**",
      "./node_modules/commander/**",
      "./node_modules/debug/**",
      "./node_modules/rfdc/**",
    ],
  },
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
