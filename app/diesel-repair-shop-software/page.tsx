import type { Metadata } from "next";

import {
  CoreSearchLandingPage,
  coreSearchPages,
} from "@/features/marketing/coreSearchPages";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

const definition = coreSearchPages.dieselRepairShop;

export const metadata: Metadata = buildSearchLandingMetadata(definition.seo);

export default function DieselRepairShopSoftwarePage() {
  const structuredData = buildSearchLandingStructuredData(definition.seo);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeSearchLandingStructuredData(structuredData),
        }}
      />
      <CoreSearchLandingPage definition={definition} />
    </>
  );
}
