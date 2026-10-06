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

const definition = coreSearchPages.heavyDutyWorkOrder;

export const metadata: Metadata = buildSearchLandingMetadata(definition.seo);

export default function HeavyDutyWorkOrderSoftwarePage() {
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
