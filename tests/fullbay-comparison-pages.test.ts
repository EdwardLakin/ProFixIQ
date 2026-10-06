import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routes = [
  "/compare/fullbay-alternative",
  "/compare/profixiq-vs-fullbay",
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Fullbay comparison acquisition pages", () => {
  it("publishes both comparison routes in the sitemap", () => {
    const sitemap = source("app/sitemap.ts");

    for (const route of routes) {
      expect(sitemap).toContain(route);
    }
  });

  it("registers only the two comparison pages as standalone public routes", () => {
    const shellBoundaries = source(
      "features/shared/lib/routes/shellBoundaries.ts",
    );

    for (const route of routes) {
      expect(shellBoundaries).toContain(`\"${route}\"`);
    }

    expect(shellBoundaries).not.toContain('\n  "/compare",');
  });

  it("registers both comparison pages with public middleware handling", () => {
    const middleware = source("middleware.ts");

    for (const route of routes) {
      expect(middleware).toContain(`pathname === \"${route}\"`);
      expect(middleware).toContain(`\"${route}\",`);
    }

    expect(middleware).not.toContain('\"/compare/:path*\"');
  });

  it("uses the canonical search landing page framework", () => {
    for (const pagePath of [
      "app/compare/fullbay-alternative/page.tsx",
      "app/compare/profixiq-vs-fullbay/page.tsx",
    ]) {
      const page = source(pagePath);
      expect(page).toContain("SearchLandingPage");
      expect(page).toContain("buildSearchLandingMetadata");
      expect(page).toContain("buildSearchLandingStructuredData");
    }
  });

  it("keeps the comparison current and fair to Fullbay", () => {
    const content = source("features/marketing/fullbaySearchPages.ts");

    expect(content).toContain("Fullbay Next");
    expect(content).toContain("QuickBooks");
    expect(content).toContain("MOTOR");
    expect(content).toContain("Mitchell");
    expect(content).toContain("voice-to-text");
    expect(content).toContain("AI receptionist");
    expect(content).toContain("October 2026");

    expect(content).not.toContain("Fullbay has no AI");
    expect(content).not.toContain("Fullbay has no customer portal");
    expect(content).not.toContain("Fullbay has no fleet");
    expect(content).not.toContain("Fullbay is outdated");
    expect(content).not.toContain("Fullbay is clunky");
  });

  it("does not claim unsupported feature or price parity", () => {
    const content = source("features/marketing/fullbaySearchPages.ts").toLowerCase();

    expect(content).not.toContain("cheaper than fullbay");
    expect(content).not.toContain("all fullbay integrations");
    expect(content).not.toContain("same integrations as fullbay");
    expect(content).not.toContain("dot compliant");
    expect(content).not.toContain("ifta reporting");
  });

  it("does not expose an authoring placeholder", () => {
    const content = source("features/marketing/fullbaySearchPages.ts");

    expect(content).toContain("media: brandedMedia");
    expect(content).not.toContain("Product media slot");
    expect(content).not.toContain("Add a real ProFixIQ screenshot");
  });
});
