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
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
