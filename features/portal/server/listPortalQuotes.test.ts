import { describe, expect, it, vi } from "vitest";
import {
  buildPortalQuoteCards,
  listPortalQuotesForCustomer,
} from "./listPortalQuotes";

function workOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "work-order-1",
    custom_id: "WO-000015",
    status: "estimate",
    vehicle_id: "vehicle-1",
    vehicle_year: 2024,
    vehicle_make: "Ford",
    vehicle_model: "F-350",
    vehicle_unit_number: null,
    vehicle_license_plate: "ABC123",
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
      workOrderReference: "WO-000015",
      vehicleLabel: "2024 Ford F-350",
      vehicleDetail: "Plate ABC123",
      createdAt: "2026-08-22T12:00:00.000Z",
      originLabel: "Shop estimate",
      title: "Brake service",
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
      originLabel: "Quote request",
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
      title: "Repair quote",
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

  it("falls back to a stable work-order reference and readable vehicle label", () => {
    const cards = buildPortalQuoteCards([
      workOrder({
        id: "abcdef12-3456-7890-abcd-ef1234567890",
        custom_id: null,
        vehicle_year: null,
        vehicle_make: null,
        vehicle_model: null,
        vehicle_unit_number: "17",
        vehicle_license_plate: null,
        estimate_number: "EST-42",
        work_order_quote_lines: [quoteLine()],
      }),
    ]);

    expect(cards[0]).toMatchObject({
      workOrderReference: "#ABCDEF12",
      estimateReference: "EST-42",
      vehicleLabel: "Your vehicle",
      vehicleDetail: "Unit 17",
    });
  });

  it("prefers canonical customer vehicle data over stale work-order snapshots", () => {
    const cards = buildPortalQuoteCards(
      [
        workOrder({
          vehicle_year: 2022,
          vehicle_make: "Ford",
          vehicle_model: "F-250",
          vehicle_license_plate: "OLD123",
          work_order_quote_lines: [quoteLine()],
        }),
      ],
      new Map([
        [
          "vehicle-1",
          {
            id: "vehicle-1",
            year: 2024,
            make: "Ford",
            model: "F-350",
            unit_number: null,
            license_plate: "NEW456",
          },
        ],
      ]),
    );

    expect(cards[0]).toMatchObject({
      vehicleLabel: "2024 Ford F-350",
      vehicleDetail: "Plate NEW456",
    });
  });

  it("carries pending and fulfilled state for durable portal grouping", () => {
    const partialPending = buildPortalQuoteCards([
      workOrder({
        work_order_quote_lines: [
          quoteLine({
            id: "approved",
            status: "approved",
            approved_at: "2026-08-22T12:10:00.000Z",
          }),
          quoteLine({ id: "pending" }),
        ],
      }),
    ]);
    const fulfilled = buildPortalQuoteCards([
      workOrder({
        status: "invoiced",
        work_order_quote_lines: [
          quoteLine({
            status: "approved",
            approved_at: "2026-08-22T12:10:00.000Z",
          }),
        ],
      }),
    ]);

    expect(partialPending[0]).toMatchObject({
      pending: true,
      fulfilled: false,
      status: "Partially approved",
    });
    expect(fulfilled[0]).toMatchObject({
      approved: true,
      pending: false,
      fulfilled: true,
    });
  });

  it("paginates past non-quote work orders before applying the card cap", async () => {
    const pages = [
      Array.from({ length: 200 }, (_, index) =>
        workOrder({ id: `non-quote-${index}` }),
      ),
      [workOrder({ work_order_quote_lines: [quoteLine()] })],
    ];
    const workOrderQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      abortSignal: vi.fn(),
    };
    workOrderQuery.select.mockReturnValue(workOrderQuery);
    workOrderQuery.eq.mockReturnValue(workOrderQuery);
    workOrderQuery.order.mockReturnValue(workOrderQuery);
    workOrderQuery.range.mockReturnValue(workOrderQuery);
    workOrderQuery.abortSignal
      .mockResolvedValueOnce({ data: pages[0], error: null })
      .mockResolvedValueOnce({ data: pages[1], error: null });

    const vehicleQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      returns: vi.fn(),
    };
    vehicleQuery.select.mockReturnValue(vehicleQuery);
    vehicleQuery.eq.mockReturnValue(vehicleQuery);
    vehicleQuery.in.mockReturnValue(vehicleQuery);
    vehicleQuery.returns.mockResolvedValue({
      data: [
        {
          id: "vehicle-1",
          year: 2024,
          make: "Ford",
          model: "F-350",
          unit_number: null,
          license_plate: "ABC123",
        },
      ],
      error: null,
    });

    const supabase = {
      from: vi.fn((table: string) =>
        table === "vehicles" ? vehicleQuery : workOrderQuery,
      ),
    };

    const cards = await listPortalQuotesForCustomer({
      supabase: supabase as never,
      customerId: "customer-1",
      shopId: "shop-1",
      signal: new AbortController().signal,
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.vehicleLabel).toBe("2024 Ford F-350");
    expect(workOrderQuery.range).toHaveBeenNthCalledWith(1, 0, 199);
    expect(workOrderQuery.range).toHaveBeenNthCalledWith(2, 200, 399);
    expect(vehicleQuery.eq).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(vehicleQuery.eq).toHaveBeenCalledWith("customer_id", "customer-1");
  });
});
