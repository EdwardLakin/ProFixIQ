import type { Metadata } from "next";

import SearchLandingPage from "@/features/marketing/components/SearchLandingPage";
import { profixiqVsFullbayPage } from "@/features/marketing/fullbaySearchPages";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

export const metadata: Metadata = buildSearchLandingMetadata(
  profixiqVsFullbayPage.seo,
);

export default function ProFixIQVsFullbayPage() {
  const structuredData = buildSearchLandingStructuredData(
    profixiqVsFullbayPage.seo,
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
          ...profixiqVsFullbayPage.config,
          faqs: profixiqVsFullbayPage.seo.faqs ?? [],
        }}
      />
    </>
  );
}
