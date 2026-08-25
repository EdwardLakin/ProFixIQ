// app/work-orders/[id]/focused-job/[lineId]/page.tsx
// Side-by-side page: left shows the Work Order client, right shows the focused job panel.
//
// Next.js 15 typing: PageProps.params is a Promise, so we must await it.

import FocusedJobSplitView from "../_components/FocusedJobSplitView";
import FocusedJobPanelClient from "../_components/FocusedJobPanelClient";

import WorkOrderIdClient from "../../Client";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import { WORK_ORDER_WORKSPACE_READER_ROLES } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

export default async function FocusedJobRoutePage(props: {
  params: Promise<{ id: string; lineId: string }>;
}): Promise<JSX.Element> {
  const { lineId } = await props.params;
  const { canonicalRole } = await requireShopPageAccess({
    allowRoles: WORK_ORDER_WORKSPACE_READER_ROLES,
  });
  const currentActor = getActorCapabilities({ role: canonicalRole });

  return (
    <FocusedJobSplitView
      left={<WorkOrderIdClient />}
      right={
        <FocusedJobPanelClient
          workOrderLineId={lineId}
          mode="tech"
          canAddJob={currentActor.canManageWorkOrders}
        />
      }
    />
  );
}
