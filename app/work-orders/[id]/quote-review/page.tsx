// app/work-orders/[id]/quote-review/page.tsx
// Split view: left shows WorkOrderIdClient, right shows Quote Review in a panel.

import FocusedJobSplitView from "../focused-job/_components/FocusedJobSplitView";
import WorkOrderIdClient from "../Client";
import QuoteReviewPanelClient from "./_components/QuoteReviewPanelClient";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <FocusedJobSplitView
      left={<WorkOrderIdClient key={id} />}
      right={<QuoteReviewPanelClient workOrderId={id} />}
    />
  );
}