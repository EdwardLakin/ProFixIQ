import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/compare-plans",
        "/field-service",
        "/fleet-maintenance",
        "/request-demo",
      ],
      disallow: [
        "/api/",
        "/auth/",
        "/customer/",
        "/dashboard/",
        "/demo/",
        "/field/",
        "/fleet/",
        "/mobile/",
        "/onboarding/",
        "/ops/",
        "/portal/",
        "/shop/",
        "/sign-in",
      ],
    },
    sitemap: "https://profixiq.com/sitemap.xml",
    host: "https://profixiq.com",
  };
}
