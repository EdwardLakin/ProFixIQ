import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import sitemap from "../app/sitemap";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("repair shop management acquisition page", () => {
  it("publishes the canonical route in the emitted sitemap and acquisition attribution", () => {
    const sitemapUrls = sitemap().map((entry) => entry.url);

    expect(sitemapUrls).toContain(
      "https://profixiq.com/repair-shop-management-software",
    );
    expect(source("features/analytics/marketingEvents.ts")).toContain(
      '"/repair-shop-management-software"',
    );
  });

  it("uses the shared search landing metadata and structured data", () => {
    const page = source("app/repair-shop-management-software/page.tsx");

    expect(page).toContain("buildSearchLandingMetadata");
    expect(page).toContain("buildSearchLandingStructuredData");
    expect(page).toContain("CoreSearchLandingPage");
  });

  it("covers the generic and automotive search intent in one page", () => {
    const content = source(
      "features/marketing/repairShopManagementPage.tsx",
    ).toLowerCase();

    for (const phrase of [
      "repair shop management software",
      "auto repair shop management software",
      "automotive shop management software",
      "mechanic shop management software",
      "shop management software",
      "repair order software",
    ]) {
      expect(content).toContain(phrase);
    }
    expect(content).toContain(
      "25 years of hands-on shop experience",
    );
  });

  it("links the homepage and shared acquisition-page footer to the category page", () => {
    const footer = source("features/shared/components/ui/Footer.tsx");

    expect(footer).toContain("Repair Shop Management Software");
    expect(footer).toContain('href: "/repair-shop-management-software"');
  });

  it("keeps the page focused on actual supported workflows", () => {
    const content = source(
      "features/marketing/repairShopManagementPage.tsx",
    ).toLowerCase();

    expect(content).not.toContain("ifta reporting");
    expect(content).not.toContain("dot compliant");
    expect(content).not.toContain("best repair shop software");
    expect(content).not.toContain("number one");
  });
});
