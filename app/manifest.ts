import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mila Mirissa — Kitchen & Good Company",
    short_name: "Mila Mirissa",
    description: "Sri Lankan favourites, warm welcomes and your next favourite table.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f1e9",
    theme_color: "#354333",
    icons: [
      { src: "/images/mila-mirissa-logo-sm.png?v=2", sizes: "128x128", type: "image/png" },
      { src: "/images/mila-mirissa-logo.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
