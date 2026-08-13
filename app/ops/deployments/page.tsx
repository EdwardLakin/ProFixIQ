import OpsReleaseHealth from "@/features/ops/components/OpsReleaseHealth";
import { getOpsReleaseHealth } from "@/features/ops/server/get-release-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsDeploymentsPage() {
  const snapshot = await getOpsReleaseHealth();
  return <OpsReleaseHealth snapshot={snapshot} />;
}
