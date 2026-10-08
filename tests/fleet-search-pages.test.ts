import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "/fleet-repair-management-software",
  "/dvir-defect-tracking-software",
  "/fleet-preventive-maintenance-software",
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("fleet search acquisition pages", () => {
  it("publishes every fleet search route in the sitemap", () => {
    const sitemap = source("app/sitemap.xml/route.ts");

    for (const route of routes) {
      expect(sitemap).toContain(route);
    }
  });

  it("uses the canonical search landing framework", () => {
    for (const pagePath of [
      "app/fleet-repair-management-software/page.tsx",
      "app/dvir-defect-tracking-software/page.tsx",
      "app/fleet-preventive-maintenance-software/page.tsx",
    ]) {
      const page = source(pagePath);
      expect(page).toContain("SearchLandingPage");
      expect(page).toContain("buildSearchLandingMetadata");
      expect(page).toContain("buildSearchLandingStructuredData");
    }
  });

  it("preserves the Fleet product boundary", () => {
    const content = source("features/marketing/fleetSearchPages.ts");

    expect(content).toContain("fleet control and administration product");
    expect(content).toContain("Shop work-order creation and repair execution remain on the Shop side");
    expect(content).not.toContain("Fleet creates shop work orders");
    expect(content).not.toContain("Fleet work-order creation");
  });

  it("avoids unsupported compliance and integration claims", () => {
    const content = source("features/marketing/fleetSearchPages.ts").toLowerCase();

    expect(content).not.toContain("dot compliant");
    expect(content).not.toContain("guaranteed compliance");
    expect(content).not.toContain("eld integration");
    expect(content).not.toContain("gps tracking integration");
    expect(content).not.toContain("ifta reporting");
  });

  it("covers the real Fleet V1 workflows", () => {
    const content = source("features/marketing/fleetSearchPages.ts");

    for (const term of [
      "Control Tower",
      "preventive maintenance",
      "service requests",
      "approvals",
      "defect review",
      "driver portal",
      "asset history",
    ]) {
      expect(content.toLowerCase()).toContain(term.toLowerCase());
    }
  });
});
