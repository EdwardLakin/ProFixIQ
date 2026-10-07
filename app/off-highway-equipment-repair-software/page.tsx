import SearchLandingPage from "@/features/marketing/components/SearchLandingPage";
import { fieldEquipmentSearchPages } from "@/features/marketing/fieldEquipmentSearchPages";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

const definition = fieldEquipmentSearchPages.offHighwayEquipmentRepair;

export const metadata = buildSearchLandingMetadata(definition.seo);

export default function OffHighwayEquipmentRepairSoftwarePage() {
  return (
    <SearchLandingPage
      config={{
        ...definition.config,
        faqs: definition.seo.faqs ?? [],
      }}
      structuredData={buildSearchLandingStructuredData(definition.seo)}
    />
  );
}
