import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "/heavy-duty-shop-management-software",
  "/diesel-repair-shop-software",
  "/heavy-duty-work-order-software",
  "/heavy-duty-inspection-software",
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("heavy-duty core search pages", () => {
  it("publishes every core route in the sitemap", () => {
    const sitemap = source("app/sitemap.ts");

    for (const route of routes) {
      expect(sitemap).toContain(route);
    }
  });

  it("uses the shared search landing framework for each route", () => {
    const pagePaths = [
      "app/heavy-duty-shop-management-software/page.tsx",
      "app/diesel-repair-shop-software/page.tsx",
      "app/heavy-duty-work-order-software/page.tsx",
      "app/heavy-duty-inspection-software/page.tsx",
    ];

    for (const pagePath of pagePaths) {
      const page = source(pagePath);
      expect(page).toContain("buildSearchLandingMetadata");
      expect(page).toContain("buildSearchLandingStructuredData");
      expect(page).toContain("CoreSearchLandingPage");
    }
  });

  it("keeps each page focused on a distinct commercial search intent", () => {
    const content = source("features/marketing/coreSearchPages.tsx");

    for (const title of [
      "Heavy-Duty Shop Management Software | ProFixIQ",
      "Diesel Repair Shop Software | ProFixIQ",
      "Heavy-Duty Work Order Software | ProFixIQ",
      "Heavy-Duty Inspection Software | ProFixIQ",
    ]) {
      expect(content).toContain(title);
    }

    expect(content).toContain("Technician is the source of truth");
    expect(content).toContain("Queues find the work. The work order workspace does the work.");
    expect(content).toContain("voice-based technician inspection capture");
  });

  it("cross-links the four commercial pages", () => {
    const content = source("features/marketing/coreSearchPages.tsx");

    for (const route of routes) {
      expect(content).toContain(`href: \"${route}\"`);
    }
  });

  it("does not introduce unsupported positioning claims", () => {
    const content = source("features/marketing/coreSearchPages.tsx").toLowerCase();

    expect(content).not.toContain("ifta reporting");
    expect(content).not.toContain("dot compliant");
    expect(content).not.toContain("fleetpride integration");
    expect(content).not.toContain("napa integration");
    expect(content).not.toContain("heavy-truck book-time labor guide software");
  });
});
