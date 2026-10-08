const siteUrl = "https://profixiq.com";

const sitemapEntries = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/compare-plans", changeFrequency: "weekly", priority: 0.9 },
  { path: "/repair-shop-management-software", changeFrequency: "monthly", priority: 0.95 },
  { path: "/heavy-duty-shop-management-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/diesel-repair-shop-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/heavy-duty-work-order-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/heavy-duty-inspection-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/fleet-repair-management-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/dvir-defect-tracking-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/fleet-preventive-maintenance-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/mobile-truck-repair-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/service-truck-work-order-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/heavy-equipment-repair-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/off-highway-equipment-repair-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/compare/fullbay-alternative", changeFrequency: "monthly", priority: 0.8 },
  { path: "/compare/profixiq-vs-fullbay", changeFrequency: "monthly", priority: 0.8 },
  { path: "/field-service", changeFrequency: "monthly", priority: 0.8 },
  { path: "/fleet-maintenance", changeFrequency: "monthly", priority: 0.8 },
  { path: "/request-demo", changeFrequency: "monthly", priority: 0.7 },
] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const dynamic = "force-static";

export function GET(): Response {
  const urls = sitemapEntries
    .map(
      ({ path, changeFrequency, priority }) => `    <url>
      <loc>${escapeXml(`${siteUrl}${path}`)}</loc>
      <changefreq>${changeFrequency}</changefreq>
      <priority>${priority}</priority>
    </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate",
    },
  });
}
