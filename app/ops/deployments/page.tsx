import OpsDeploymentHealth from "@/features/ops/components/OpsDeploymentHealth";
import { getOpsDeploymentHealth } from "@/features/ops/server/get-deployment-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsDeploymentsPage() {
  const snapshot = await getOpsDeploymentHealth();
  return <OpsDeploymentHealth snapshot={snapshot} />;
}
