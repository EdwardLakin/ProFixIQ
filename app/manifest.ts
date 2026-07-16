import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProFixIQ",
    short_name: "ProFixIQ",
    description: "Repair shop operations, inspections, and technician workflows.",
    id: "/launch",
    start_url: "/launch?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#0b1729",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Work orders", short_name: "Work orders", url: "/mobile/work-orders" },
      { name: "Inspections", short_name: "Inspections", url: "/mobile/inspections" },
      { name: "Appointments", short_name: "Appointments", url: "/mobile/appointments" },
    ],
  };
}
