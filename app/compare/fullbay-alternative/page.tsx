import type { Metadata } from "next";

import SearchLandingPage from "@/features/marketing/components/SearchLandingPage";
import { fullbayAlternativePage } from "@/features/marketing/fullbaySearchPages";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

export const metadata: Metadata = buildSearchLandingMetadata(
  fullbayAlternativePage.seo,
);

export default function FullbayAlternativePage() {
  const structuredData = buildSearchLandingStructuredData(
    fullbayAlternativePage.seo,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeSearchLandingStructuredData(structuredData),
        }}
      />
      <SearchLandingPage
        config={{
          ...fullbayAlternativePage.config,
          faqs: fullbayAlternativePage.seo.faqs ?? [],
        }}
      />
    </>
  );
}
