import { describe, expect, it } from "vitest";
import { mapRequestToWorkbenchModel } from "./mapToWorkbenchModel";

describe("parts request workbench job context", () => {
  it("moves maintenance service context to the request header and leaves the part description blank", () => {
    const model = mapRequestToWorkbenchModel({
      request: {
        id: "request-1",
        work_order_id: "work-order-1",
        quote_line_id: "quote-line-1",
        job_id: null,
        notes:
          "Service to quote: Automatic transmission service\nQuote line: quote-line-1",
        status: "requested",
      },
      items: [
        {
          id: "item-1",
          description: "Automatic transmission service",
          qty: 1,
          status: "requested",
        },
      ],
      jobContext: "",
    });

    expect(model.jobContext).toBe("Automatic transmission service");
    expect(model.items[0]?.description).toBe("");
  });

  it("does not let the page single-line fallback replace a pre-approval quote service", () => {
    const model = mapRequestToWorkbenchModel({
      request: {
        id: "request-1",
        work_order_id: "work-order-1",
        quote_line_id: "quote-line-1",
        job_id: null,
        notes:
          "Service to quote: Cooling system service\nMaintenance parts quote required: Cooling system service (COOLANT_SERVICE)",
        status: "requested",
      },
      items: [
        {
          id: "item-1",
          description: "",
          qty: 1,
          status: "requested",
        },
      ],
      jobContext: "Diesel Works",
    });

    expect(model.jobContext).toBe("Cooling system service");
    expect(model.items[0]?.description).toBe("");
  });

  it("reads the legacy maintenance quote note when canonical service context is absent", () => {
    const model = mapRequestToWorkbenchModel({
      request: {
        id: "request-1",
        quote_line_id: "quote-line-1",
        job_id: null,
        notes:
          "Maintenance parts quote required: Brake fluid flush (BRAKE_FLUID_FLUSH)",
      },
      items: [
        {
          id: "item-1",
          description: "",
          qty: 1,
        },
      ],
      jobContext: "Diesel Works",
    });

    expect(model.jobContext).toBe("Brake fluid flush");
    expect(model.items[0]?.description).toBe("");
  });

  it("keeps compatibility with existing placeholder rows while hiding the placeholder from the part field", () => {
    const model = mapRequestToWorkbenchModel({
      request: {
        id: "request-1",
        quote_line_id: "quote-line-1",
        job_id: null,
      },
      items: [
        {
          id: "item-1",
          description: "Parts to quote — Brake fluid flush",
          qty: 1,
        },
      ],
      jobContext: "",
    });

    expect(model.jobContext).toBe("Brake fluid flush");
    expect(model.items[0]?.description).toBe("");
  });

  it("keeps the canonical work-order-line context when one is available", () => {
    const model = mapRequestToWorkbenchModel({
      request: { id: "request-1", job_id: null },
      items: [
        {
          id: "item-1",
          description: "Oil filter",
          qty: 1,
          work_order_line_id: "line-1",
        },
      ],
      jobContext: "Replace front brakes",
    });

    expect(model.jobContext).toBe("Replace front brakes");
    expect(model.items[0]?.description).toBe("Oil filter");
  });
});
