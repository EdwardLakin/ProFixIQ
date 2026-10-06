import OpsAIUsage from "@/features/ops/components/OpsAIUsage";
import {
  getOpsAIAccountingCompleteness,
  getOpsAIUsage,
} from "@/features/ops/server/get-ai-usage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsAIUsagePage() {
  const [snapshot, completeness] = await Promise.all([
    getOpsAIUsage(),
    getOpsAIAccountingCompleteness(),
  ]);
  return <OpsAIUsage snapshot={snapshot} completeness={completeness} />;
}
