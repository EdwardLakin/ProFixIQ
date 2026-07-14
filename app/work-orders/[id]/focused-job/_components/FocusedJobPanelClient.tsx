// app/work-orders/[id]/focused-job/_components/FocusedJobPanelClient.tsx
// Client wrapper for right-side in-page panel (NOT modal overlay)

"use client";

import { useRouter } from "next/navigation";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";

export default function FocusedJobPanelClient(props: {
  workOrderLineId: string;
  mode?: "tech" | "view";
}): JSX.Element {
  const router = useRouter();

  return (
    <div className="sticky top-4">
      <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <FocusedJobModal
          isOpen={true}
          variant="panel"
          onClose={() => router.back()}
          workOrderLineId={props.workOrderLineId}
          mode={props.mode ?? "tech"}
        />
      </div>
    </div>
  );
}