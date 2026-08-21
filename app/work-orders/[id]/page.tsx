// app/work-orders/[id]/page.tsx
import WorkOrderOperationalTimelineDock from "@/features/operations/components/WorkOrderOperationalTimelineDock";
import { WorkOrderWorkspaceFrame } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import { loadCurrentWorkOrderWorkspaceSnapshot } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";
import WorkOrderIdClient from "./Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WorkOrderWorkspacePageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: WorkOrderWorkspacePageProps) {
  const { id } = await params;
  const initialWorkspaceSnapshot =
    await loadCurrentWorkOrderWorkspaceSnapshot({ routeId: id });

  return (
    <WorkOrderWorkspaceFrame initialResource={initialWorkspaceSnapshot?.resource}>
      <WorkOrderIdClient />
      <WorkOrderOperationalTimelineDock />
    </WorkOrderWorkspaceFrame>
  );
}
