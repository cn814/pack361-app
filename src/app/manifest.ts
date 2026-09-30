import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pack 361 Ellicott City",
    short_name: "Pack 361",
    description: "Private member app for Cub Scout Pack 361",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f4",
    theme_color: "#1b4332",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
