import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Loamy — Grow a little joy",
    short_name: "Loamy",
    description: "Choose what you want to grow. We'll help you grow it.",
    start_url: "/", // members land in their garden, visitors on Discover
    scope: "/",
    display: "standalone",
    background_color: "#f3f3f1",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
