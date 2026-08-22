import { describe, expect, it } from "vitest";
import { buildPortalQuoteCards } from "./listPortalQuotes";

function workOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "work-order-1",
    vehicle_id: "vehicle-1",
    created_at: "2026-08-22T12:00:00.000Z",
    scheduled_at: null,
    invoice_sent_at: null,
    estimate_number: null,
    external_id: null,
    work_order_quote_lines: [],
    ...overrides,
  };
}

function quoteLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-line-1",
    description: "Brake service",
    status: "sent",
    stage: "customer_review",
    approved_at: null,
    declined_at: null,
    work_order_line_id: null,
    sent_to_customer_at: "2026-08-22T12:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("portal quote cards", () => {
  it("includes sent quotes on ordinary shop work orders", () => {
    const cards = buildPortalQuoteCards([
      workOrder({ work_order_quote_lines: [quoteLine()] }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      workOrderId: "work-order-1",
      sent: true,
      status: "Ready for your review",
    });
  });

  it("keeps customer-origin draft requests visible without opening review", () => {
    const cards = buildPortalQuoteCards([
      workOrder({
        external_id: "portal_quote:request-1",
        work_order_quote_lines: [
          quoteLine({
            status: "draft",
            stage: "draft",
            sent_to_customer_at: null,
          }),
        ],
      }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      sent: false,
      status: "Shop is preparing your quote",
    });
  });

  it("omits unsent internal lines and hidden revisions", () => {
    const cards = buildPortalQuoteCards([
      workOrder({
        work_order_quote_lines: [
          quoteLine({
            id: "internal-draft",
            status: "draft",
            stage: "draft",
            sent_to_customer_at: null,
          }),
          quoteLine({ id: "superseded", status: "superseded" }),
        ],
      }),
    ]);

    expect(cards).toEqual([]);
  });
});
