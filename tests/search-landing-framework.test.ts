import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "../features/marketing/searchLanding";

const seo = {
  title: "Heavy-Duty Work Order Software | ProFixIQ",
  description: "A focused description for a ProFixIQ search landing page.",
  path: "/heavy-duty-work-order-software" as const,
  keywords: ["heavy duty work order software"],
  faqs: [
    {
      question: "Does ProFixIQ support heavy-duty work orders?",
      answer: "Yes. Work orders carry repair, inspection, parts, approval, and completion context.",
    },
  ],
};

describe("search landing page framework", () => {
  it("builds route-specific canonical and social metadata", () => {
    const metadata = buildSearchLandingMetadata(seo);

    expect(metadata.title).toBe(seo.title);
    expect(metadata.description).toBe(seo.description);
    expect(metadata.alternates?.canonical).toBe(seo.path);
    expect(metadata.openGraph).toMatchObject({
      title: seo.title,
      description: seo.description,
      url: seo.path,
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("builds a connected WebSite, SoftwareApplication, WebPage, and FAQ graph", () => {
    const data = buildSearchLandingStructuredData(seo);

    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@graph"]).toHaveLength(4);
    expect(data["@graph"][0]).toMatchObject({
      "@type": "WebSite",
      "@id": "https://profixiq.com/#website",
    });
    expect(data["@graph"][1]).toMatchObject({
      "@type": "SoftwareApplication",
      "@id": "https://profixiq.com/#software",
    });
    expect(data["@graph"][2]).toMatchObject({
      "@type": "WebPage",
      url: "https://profixiq.com/heavy-duty-work-order-software",
      name: seo.title,
      isPartOf: { "@id": "https://profixiq.com/#website" },
      about: { "@id": "https://profixiq.com/#software" },
    });
    expect(data["@graph"][3]).toMatchObject({
      "@type": "FAQPage",
    });
  });

  it("escapes structured data before HTML insertion", () => {
    const data = buildSearchLandingStructuredData({
      ...seo,
      description: "Use <script> only as text.",
    });

    const serialized = serializeSearchLandingStructuredData(data);

    expect(serialized).toContain("\\u003cscript>");
    expect(serialized).not.toContain("<script>");
  });

  it("provides the reusable commercial search-page sections", () => {
    const component = readFileSync(
      "features/marketing/components/SearchLandingPage.tsx",
      "utf8",
    );

    for (const section of [
      "SearchHero",
      "SearchPainPoints",
      "SearchWorkflow",
      "SearchProductProof",
      "SearchComparison",
      "SearchFaq",
      "SearchFinalCta",
    ]) {
      expect(component).toContain(`export function ${section}`);
    }

    expect(component).toContain('href="/compare-plans"');
    expect(component).toContain('href="/request-demo"');
    expect(component).toContain("Product media slot");
  });
});
