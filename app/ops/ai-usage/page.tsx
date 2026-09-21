import OpsAIUsage from "@/features/ops/components/OpsAIUsage";
import { getOpsAIUsage } from "@/features/ops/server/get-ai-usage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsAIUsagePage() {
  const snapshot = await getOpsAIUsage();
  return <OpsAIUsage snapshot={snapshot} />;
}
