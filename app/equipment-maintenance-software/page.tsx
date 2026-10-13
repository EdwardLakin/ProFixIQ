import SearchLandingPage from "@/features/marketing/components/SearchLandingPage";
import { equipmentMaintenancePage } from "@/features/marketing/equipmentMaintenancePage";
import {
  buildSearchLandingMetadata,
  buildSearchLandingStructuredData,
} from "@/features/marketing/searchLanding";

export const metadata = buildSearchLandingMetadata(equipmentMaintenancePage.seo);

export default function EquipmentMaintenanceSoftwarePage() {
  return (
    <SearchLandingPage
      config={{
        ...equipmentMaintenancePage.config,
        faqs: equipmentMaintenancePage.seo.faqs ?? [],
      }}
      structuredData={buildSearchLandingStructuredData(equipmentMaintenancePage.seo)}
    />
  );
}
