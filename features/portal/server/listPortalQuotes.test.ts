import { describe, expect, it, vi } from "vitest";
import {
  buildPortalQuoteCards,
  listPortalQuotesForCustomer,
} from "./listPortalQuotes";

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
    work_order_lines: [],
    ...overrides,
  };
}

function directLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "direct-line-1",
    description: "Alignment",
    status: "awaiting_approval",
    line_status: "quoted",
    approval_state: "pending",
    approval_at: null,
    quoted_at: "2026-08-22T12:00:00.000Z",
    voided_at: null,
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

  it("aggregates ordinary work-order quote lines into one card", () => {
    const cards = buildPortalQuoteCards([
      workOrder({
        work_order_quote_lines: [
          quoteLine({ id: "quote-line-1", description: "Brakes" }),
          quoteLine({ id: "quote-line-2", description: "Steering" }),
        ],
      }),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      aggregate: true,
      detail: "2 repair lines • Brakes, Steering",
    });
  });

  it("includes direct customer approval lines without duplicate linked lines", () => {
    const cards = buildPortalQuoteCards([
      workOrder({ work_order_lines: [directLine()] }),
      workOrder({
        id: "work-order-2",
        work_order_quote_lines: [
          quoteLine({ work_order_line_id: "direct-line-2" }),
        ],
        work_order_lines: [
          directLine({
            id: "direct-line-2",
            approval_state: "approved",
            approval_at: "2026-08-22T12:10:00.000Z",
          }),
        ],
      }),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      workOrderId: "work-order-1",
      title: "Alignment",
      sent: true,
      status: "Ready for your review",
    });
    expect(cards[1]?.detail).toBe("Repair quote • Appointment after approval");
  });

  it("paginates past non-quote work orders before applying the card cap", async () => {
    const pages = [
      Array.from({ length: 200 }, (_, index) =>
        workOrder({ id: `non-quote-${index}` }),
      ),
      [workOrder({ work_order_quote_lines: [quoteLine()] })],
    ];
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      abortSignal: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockReturnValue(query);
    query.abortSignal
      .mockResolvedValueOnce({ data: pages[0], error: null })
      .mockResolvedValueOnce({ data: pages[1], error: null });
    const supabase = { from: vi.fn(() => query) };

    const cards = await listPortalQuotesForCustomer({
      supabase: supabase as never,
      customerId: "customer-1",
      shopId: "shop-1",
      signal: new AbortController().signal,
    });

    expect(cards).toHaveLength(1);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 199);
    expect(query.range).toHaveBeenNthCalledWith(2, 200, 399);
  });
});
