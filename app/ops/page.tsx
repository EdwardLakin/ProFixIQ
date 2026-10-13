import OpsDashboard from "@/features/ops/components/OpsDashboard";
import { getOpsDashboardFeedback } from "@/features/ops/server/get-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsPage() {
  const feedback = await getOpsDashboardFeedback();
  return <OpsDashboard feedback={feedback} />;
}
