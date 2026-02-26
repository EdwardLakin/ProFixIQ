// app/work-orders/[id]/quote-review/page.tsx
// Split view: left shows WorkOrderIdClient, right shows Quote Review in a panel.

import FocusedJobSplitView from "../focused-job/_components/FocusedJobSplitView";
import WorkOrderIdClient from "../Client"; // ⚠️ must match actual filename casing
import QuoteReviewPanelClient from "./_components/QuoteReviewPanelClient";

export default function Page({ params }: { params: { id: string } }) {
  const { id } = params;

  return (
    <FocusedJobSplitView
      left={<WorkOrderIdClient key={id} />}
      right={<QuoteReviewPanelClient workOrderId={id} />}
    />
  );
}