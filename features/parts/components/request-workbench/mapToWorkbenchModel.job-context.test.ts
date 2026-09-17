import { describe, expect, it } from "vitest";
import { mapRequestToWorkbenchModel } from "./mapToWorkbenchModel";

describe("parts request workbench job context", () => {
  it("shows the maintenance service when a pre-approval quote request has no work-order line yet", () => {
    const model = mapRequestToWorkbenchModel({
      request: {
        id: "request-1",
        work_order_id: "work-order-1",
        quote_line_id: "quote-line-1",
        job_id: null,
        status: "requested",
      },
      items: [
        {
          id: "item-1",
          description: "Parts to quote — Automatic transmission service",
          qty: 1,
          status: "requested",
        },
      ],
      jobContext: "",
    });

    expect(model.jobContext).toBe("Automatic transmission service");
  });

  it("keeps the canonical work-order-line context when one is available", () => {
    const model = mapRequestToWorkbenchModel({
      request: { id: "request-1", job_id: null },
      items: [
        {
          id: "item-1",
          description: "Parts to quote — Brake fluid flush",
          qty: 1,
        },
      ],
      jobContext: "Replace front brakes",
    });

    expect(model.jobContext).toBe("Replace front brakes");
  });
});
