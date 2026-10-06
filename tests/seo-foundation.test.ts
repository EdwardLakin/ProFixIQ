import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("public SEO foundation", () => {
  it("publishes a controlled marketing sitemap", () => {
    const sitemap = source("app/sitemap.ts");

    expect(sitemap).toContain('const siteUrl = "https://profixiq.com"');
    expect(sitemap).toContain("/compare-plans");
    expect(sitemap).toContain("/field-service");
    expect(sitemap).toContain("/fleet-maintenance");
    expect(sitemap).toContain("/request-demo");
    expect(sitemap).not.toContain("lastModified: new Date");
  });

  it("keeps authenticated and operational routes out of crawler scope", () => {
    const robots = source("app/robots.ts");

    for (const route of [
      "/api/",
      "/dashboard/",
      "/demo/",
      "/ops/",
      "/portal/",
      "/shop/",
    ]) {
      expect(robots).toContain(`\"${route}\"`);
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
