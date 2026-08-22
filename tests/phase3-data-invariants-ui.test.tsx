import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RequestStatusSummary } from "../app/parts/requests/[id]/request-detail-components";

describe("Phase 3 data invariant UI", () => {
  it("renders request counters with the canonical request-flow labels", () => {
    const markup = renderToStaticMarkup(
      <RequestStatusSummary
        counts={{ pending: 1, in_progress: 2, ready: 1, complete: 1 }}
      />,
    );

    expect(markup).toContain("Pending:");
    expect(markup).toContain("In Progress:");
    expect(markup).toContain("Ready to Allocate:");
    expect(markup).toContain("Complete:");
    expect(markup).not.toContain("Ordered:");
  });
});
