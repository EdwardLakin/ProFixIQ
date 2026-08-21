// app/work-orders/[id]/page.tsx
import WorkOrderOperationalTimelineDock from "@/features/operations/components/WorkOrderOperationalTimelineDock";
import { WorkOrderWorkspaceFrame } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import WorkOrderIdClient from "./Client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <WorkOrderWorkspaceFrame>
      <WorkOrderIdClient />
      <WorkOrderOperationalTimelineDock />
    </WorkOrderWorkspaceFrame>
  );
}
