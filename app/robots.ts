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
        "/account/",
        "/api/",
        "/appointments/",
        "/auth/",
        "/billing/",
        "/customer/",
        "/customers/",
        "/dashboard/",
        "/demo/",
        "/field/",
        "/fleet/",
        "/inspections/",
        "/inventory/",
        "/invoices/",
        "/mobile/",
        "/onboarding/",
        "/ops/",
        "/parts/",
        "/portal/",
        "/quotes/",
        "/settings/",
        "/shop/",
        "/sign-in",
        "/vehicles/",
        "/work-orders/",
        "/workforce/",
      ],
    },
    sitemap: "https://profixiq.com/sitemap.xml",
    host: "https://profixiq.com",
  };
}
