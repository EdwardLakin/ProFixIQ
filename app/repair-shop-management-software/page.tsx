import type { Metadata } from "next";

import {
  CoreSearchLandingPage,
} from "@/features/marketing/coreSearchPages";
import { repairShopManagementPage } from "@/features/marketing/repairShopManagementPage";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
  serializeSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

export const metadata: Metadata = buildSearchLandingMetadata(
  repairShopManagementPage.seo,
);

export default function RepairShopManagementSoftwarePage() {
  const structuredData = buildSearchLandingStructuredData(
    repairShopManagementPage.seo,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeSearchLandingStructuredData(structuredData),
        }}
      />
      <CoreSearchLandingPage definition={repairShopManagementPage} />
    </>
  );
}
