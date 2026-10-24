import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mila Mirissa — Kitchen & Good Company",
    short_name: "Mila Mirissa",
    description: "Sri Lankan favourites, warm welcomes and your next favourite table.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f1e9",
    theme_color: "#3f3325",
    icons: [
      { src: "/icon.png?v=4", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png?v=4", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
  };
}
