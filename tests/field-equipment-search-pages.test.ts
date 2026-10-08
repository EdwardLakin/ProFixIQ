import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "/mobile-truck-repair-software",
  "/service-truck-work-order-software",
  "/heavy-equipment-repair-software",
  "/off-highway-equipment-repair-software",
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("field and equipment search acquisition pages", () => {
  it("publishes all four routes in the sitemap and standalone shell boundary", () => {
    const sitemap = source("app/sitemap.xml/route.ts");
    const shell = source("features/shared/lib/routes/shellBoundaries.ts");

    for (const route of routes) {
      expect(sitemap).toContain(route);
      expect(shell).toContain(route);
    }
  });

  it("allows the mobile acquisition page through robots despite the protected /mobile prefix", () => {
    const robots = source("app/robots.ts");
    expect(robots).toContain('"/mobile-truck-repair-software"');
    expect(robots).toContain('"/mobile"');
  });

  it("uses the canonical search landing framework for every page", () => {
    for (const pagePath of [
      "app/mobile-truck-repair-software/page.tsx",
      "app/service-truck-work-order-software/page.tsx",
      "app/heavy-equipment-repair-software/page.tsx",
      "app/off-highway-equipment-repair-software/page.tsx",
    ]) {
      const page = source(pagePath);
      expect(page).toContain("SearchLandingPage");
      expect(page).toContain("buildSearchLandingMetadata");
      expect(page).toContain("buildSearchLandingStructuredData");
    }
  });

  it("preserves Shop, Field, and Fleet product boundaries in the copy", () => {
    const content = source("features/marketing/fieldEquipmentSearchPages.ts");
    expect(content).toContain("Field Service is a dedicated service-truck surface");
    expect(content).toContain("Shop work-order creation belongs to the Shop product");
    expect(content).toContain("Fleet stays administrative");
  });

  it("does not claim unsupported integrations or compliance", () => {
    const content = source("features/marketing/fieldEquipmentSearchPages.ts").toLowerCase();
    expect(content).not.toContain("dot compliant");
    expect(content).not.toContain("ifta reporting");
    expect(content).not.toContain("integrates with caterpillar");
    expect(content).not.toContain("integrates with komatsu");
  });
});
