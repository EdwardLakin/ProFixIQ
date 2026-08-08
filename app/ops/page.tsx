import AgentConsolePage from "@/features/agent/agent-console/app/agent/page";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsPage() {
  await requireOpsOperatorPageAccess();
  return <AgentConsolePage />;
}
