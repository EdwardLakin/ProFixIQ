const fleetManifest = {
  name: "ProFixIQ Fleet",
  short_name: "ProFixIQ Fleet",
  description:
    "Fleet asset readiness, preventive maintenance, service decisions, and repair history.",
  id: "/",
  start_url: "/?source=pwa",
  scope: "/",
  display: "standalone",
  background_color: "#050B16",
  theme_color: "#0D172A",
  orientation: "any",
  icons: [
    { src: "/pwa-icons/icon-192", sizes: "192x192", type: "image/png" },
    { src: "/pwa-icons/icon-512", sizes: "512x512", type: "image/png" },
    {
      src: "/pwa-icons/icon-maskable-512",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    { name: "Assets", short_name: "Assets", url: "/assets" },
    { name: "Pre-trips", short_name: "Pre-trips", url: "/pre-trips" },
    { name: "Requests", short_name: "Requests", url: "/requests" },
    { name: "Maintenance", short_name: "Maintenance", url: "/maintenance" },
  ],
} as const;

export function GET() {
  return Response.json(fleetManifest, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Type": "application/manifest+json",
    },
  });
}
