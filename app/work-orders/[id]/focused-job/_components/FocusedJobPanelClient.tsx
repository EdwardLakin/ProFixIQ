// app/work-orders/[id]/focused-job/_components/FocusedJobPanelClient.tsx
// Client wrapper for right-side in-page panel (NOT modal overlay)

"use client";

import { useRouter } from "next/navigation";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { useWorkspaceCapabilities } from "@/features/workspace/authorization/useWorkspaceCapabilities";

export default function FocusedJobPanelClient(props: {
  workOrderLineId: string;
  mode?: "tech" | "view";
  canAddJob: boolean;
}): JSX.Element {
  const router = useRouter();
  const { can } = useWorkspaceCapabilities();
  const canExecuteJob = can(
    WORKSPACE_CAPABILITIES.executeAssignedWorkOrderJobs,
  );

  return (
    <div className="sticky top-4">
      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <FocusedJobModal
          isOpen={true}
          variant="panel"
          onClose={() => router.back()}
          workOrderLineId={props.workOrderLineId}
          canExecuteJob={canExecuteJob}
          mode={props.mode ?? "tech"}
          canAddJob={props.canAddJob}
        />
      </div>
    </div>
  );
}
