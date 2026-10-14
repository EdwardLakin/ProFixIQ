import OpsMarketingMediaLibraryManager from "@/features/ops/components/OpsMarketingMediaLibraryManager";
import OpsMarketingMediaManager from "@/features/ops/components/OpsMarketingMediaManager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OpsMarketingPage() {
  return (
    <>
      <OpsMarketingMediaManager />
      <OpsMarketingMediaLibraryManager />
    </>
  );
}
