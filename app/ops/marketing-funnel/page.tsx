import OpsMarketingFunnel from "@/features/ops/components/OpsMarketingFunnel";
import { getOpsMarketingFunnel } from "@/features/ops/server/get-marketing-funnel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsMarketingFunnelPage() {
  const snapshot = await getOpsMarketingFunnel();
  return <OpsMarketingFunnel snapshot={snapshot} />;
}
