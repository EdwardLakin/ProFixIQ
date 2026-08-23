import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RequestStatusSummary } from "../app/parts/requests/[id]/request-detail-components";

describe("Phase 3 data invariant UI", () => {
  it("renders request counters with the canonical operational-stage labels", () => {
    const markup = renderToStaticMarkup(
      <RequestStatusSummary
        counts={{
          needs_quote: 1,
          awaiting_approval: 2,
          order_receive: 1,
          ready_for_tech: 1,
          completed: 1,
        }}
      />,
    );

    expect(markup).toContain("Needs Quote:");
    expect(markup).toContain("Awaiting Approval:");
    expect(markup).toContain("Order &amp; Receive:");
    expect(markup).toContain("Ready for Tech:");
    expect(markup).toContain("Completed:");
    expect(markup).not.toContain("Ordered:");
  });
});
