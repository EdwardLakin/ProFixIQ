import OpsDashboard from "@/features/ops/components/OpsDashboard";
import { getOpsDashboardRequests } from "@/features/ops/server/get-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsPage() {
  const requests = await getOpsDashboardRequests();
  return <OpsDashboard requests={requests} />;
}
