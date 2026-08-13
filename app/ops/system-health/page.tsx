import OpsSystemHealth from "@/features/ops/components/OpsSystemHealth";
import { getOpsSystemHealth } from "@/features/ops/server/get-system-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsSystemHealthPage() {
  const snapshot = await getOpsSystemHealth();
  return <OpsSystemHealth snapshot={snapshot} />;
}
