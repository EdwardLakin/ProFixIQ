import type { Metadata } from "next";

import SearchLandingPage from "@/features/marketing/components/SearchLandingPage";
import { fleetSearchPages } from "@/features/marketing/fleetSearchPages";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

const page = fleetSearchPages.dvirDefectTracking;

export const metadata: Metadata = buildSearchLandingMetadata(page.seo);

export default function DvirDefectTrackingSoftwarePage() {
  const structuredData = buildSearchLandingStructuredData(page.seo);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeSearchLandingStructuredData(structuredData),
        }}
      />
      <SearchLandingPage config={{ ...page.config, faqs: page.seo.faqs ?? [] }} />
    </>
  );
}
