// app/work-orders/[id]/focused-job/[lineId]/page.tsx
// Side-by-side page: left shows the Work Order client, right shows the focused job panel.
//
// IMPORTANT:
// - We render the existing WorkOrderIdClient directly (no page import).
// - The right panel reuses FocusedJobModal via a client wrapper in "panel" mode.

import FocusedJobSplitView from "../_components/FocusedJobSplitView";
import FocusedJobPanelClient from "../_components/FocusedJobPanelClient";

// ✅ This is your real work order UI (client component)
// Path is relative from: app/work-orders/[id]/focused-job/[lineId]/page.tsx -> ../../Client
import WorkOrderIdClient from "../../Client";

export default function FocusedJobRoutePage(props: {
  params: { id: string; lineId: string };
}): JSX.Element {
  const { lineId } = props.params;

  return (
    <FocusedJobSplitView
      left={<WorkOrderIdClient />}
      right={<FocusedJobPanelClient workOrderLineId={lineId} mode="tech" />}
    />
  );
}