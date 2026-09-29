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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
