import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("public SEO foundation", () => {
  it("publishes a controlled, valid XML marketing sitemap", () => {
    const sitemap = source("app/sitemap.xml/route.ts");

    expect(sitemap).toContain('const siteUrl = "https://profixiq.com"');
    expect(sitemap).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(sitemap).toContain(
      '"Content-Type": "application/xml; charset=utf-8"',
    );
    expect(sitemap).toContain("/compare-plans");
    expect(sitemap).toContain("/field-service");
    expect(sitemap).toContain("/fleet-maintenance");
    expect(sitemap).toContain("/request-demo");
    expect(sitemap).not.toContain("lastModified: new Date");
  });

  it("keeps authenticated and operational route roots and descendants out of crawler scope", () => {
    const robots = source("app/robots.ts");

    for (const route of [
      "/account",
      "/api",
      "/billing",
      "/customers",
      "/dashboard",
      "/demo",
      "/inspections",
      "/ops",
      "/parts",
      "/portal",
      "/shop",
      "/vehicles",
      "/work-orders",
    ]) {
      expect(robots).toContain(`\"${route}\"`);
      expect(robots).not.toContain(`\"${route}/\"`);
    }

    expect(robots).toContain('sitemap: "https://profixiq.com/sitemap.xml"');
  });

  it("describes ProFixIQ as repair shop software instead of a diagnostics assistant", () => {
    const rootLayout = source("app/layout.tsx");
    const landingLayout = source("app/(landing)/layout.tsx");
    const homePage = source("app/page.tsx");

    expect(rootLayout).toContain("Heavy-Duty & Automotive Repair Shop Software");
    expect(landingLayout).not.toContain("AI-powered vehicle diagnostics and repair assistant");
    expect(homePage).toContain('"@type": "Organization"');
    expect(homePage).toContain('"@type": "SoftwareApplication"');
    expect(homePage).toContain('canonical: "/"');
  });

  it("keeps route-specific search and large-card social metadata", () => {
    const rootLayout = source("app/layout.tsx");
    const pricing = source("app/compare-plans/layout.tsx");
    const field = source("app/field-service/layout.tsx");
    const fleet = source("app/fleet-maintenance/layout.tsx");
    const demo = source("app/request-demo/layout.tsx");
    const fieldPage = source("app/field-service/page.tsx");
    const fleetPage = source("app/fleet-maintenance/page.tsx");

    expect(rootLayout).not.toContain('openGraph: {\n    type: "website",\n    siteName: "ProFixIQ",\n    title:');
    expect(pricing).toContain("ProFixIQ Pricing");
    expect(pricing).toContain('url: "/compare-plans"');
    expect(field).toContain('url: "/field-service"');
    expect(fleet).toContain('url: "/fleet-maintenance"');
    expect(demo).toContain('url: "/request-demo"');

    for (const metadataSource of [pricing, field, fleet, demo]) {
      expect(metadataSource).toContain('card: "summary_large_image"');
    }

    expect(fieldPage).not.toContain("export const metadata");
    expect(fleetPage).not.toContain("export const metadata");
  });

  it("renders the social image from the canonical mark without an invalid background layer", () => {
    const image = source("app/opengraph-image.tsx");

    expect(image).toContain('src="https://profixiq.com/pwa-icons/icon-512"');
    expect(image).toContain('backgroundColor: "#07111f"');
    expect(image).toContain("backgroundImage:");
    expect(image).not.toContain("transparent 34%), #07111f");
  });

  it("defines the acquisition conversion event contract", () => {
    const events = source("features/analytics/marketingEvents.ts");

    for (const event of [
      "marketing_trial_click",
      "marketing_demo_click",
      "marketing_subscribe_click",
      "pricing_view",
      "checkout_started",
      "signup_completed",
      "onboarding_completed",
    ]) {
      expect(events).toContain(event);
    }
  });
});
