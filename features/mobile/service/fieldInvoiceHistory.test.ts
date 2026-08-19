import { describe, expect, it } from "vitest";

import {
  buildFieldInvoiceHistoryRows,
  filterFieldInvoiceHistoryRows,
  summarizeFieldInvoiceHistory,
  type FieldInvoiceVersion,
  type FieldInvoiceWorkOrder,
} from "./fieldInvoiceHistory";

function workOrder(
  id: string,
  overrides: Partial<FieldInvoiceWorkOrder> = {},
): FieldInvoiceWorkOrder {
  return {
    id,
    custom_id: `RO-${id}`,
    updated_at: "2026-08-18T12:00:00.000Z",
    paid_at: null,
    customers: {
      first_name: "Jamie",
      last_name: "Smith",
      email: "jamie@example.com",
    },
    vehicles: {
      year: 2024,
      make: "Ford",
      model: "F-550",
      license_plate: "FIELD1",
    },
    ...overrides,
  };
}

function version(
  id: string,
  workOrderId: string,
  overrides: Partial<FieldInvoiceVersion> = {},
): FieldInvoiceVersion {
  return {
    id,
    work_order_id: workOrderId,
    version_number: 1,
    lifecycle_status: "issued",
    currency: "CAD",
    total: 500,
    paid_total: 0,
    refunded_total: 0,
    outstanding_total: 500,
    issued_at: "2026-08-18T12:00:00.000Z",
    created_at: "2026-08-18T12:00:00.000Z",
    invoices: { invoice_number: `INV-${id}` },
    ...overrides,
  };
}

describe("Field invoice history", () => {
  it("uses the latest active invoice version and derives payment state from canonical balances", () => {
    const rows = buildFieldInvoiceHistoryRows(
      [workOrder("one"), workOrder("two")],
      [
        version("old", "one", { version_number: 1, outstanding_total: 500 }),
        version("new", "one", {
          version_number: 2,
          lifecycle_status: "partially_paid",
          paid_total: 300,
          outstanding_total: 200,
        }),
        version("void", "one", {
          version_number: 3,
          lifecycle_status: "voided",
          outstanding_total: 0,
        }),
        version("paid", "two", {
          lifecycle_status: "paid",
          outstanding_total: 0,
          paid_total: 500,
        }),
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.workOrderId === "one")).toMatchObject({
      invoiceVersionId: "new",
      paymentState: "unpaid",
      outstandingTotal: 200,
    });
    expect(rows.find((row) => row.workOrderId === "two")?.paymentState).toBe(
      "paid",
    );
  });

  it("filters by payment state and operational identity", () => {
    const rows = buildFieldInvoiceHistoryRows(
      [
        workOrder("one"),
        workOrder("two", {
          custom_id: "RO-SPECIAL",
          customers: {
            first_name: "Taylor",
            last_name: "Jones",
            email: "taylor@example.com",
          },
        }),
      ],
      [
        version("one", "one"),
        version("two", "two", {
          lifecycle_status: "paid",
          outstanding_total: 0,
        }),
      ],
    );

    expect(filterFieldInvoiceHistoryRows(rows, "unpaid", "field1")).toHaveLength(1);
    expect(filterFieldInvoiceHistoryRows(rows, "paid", "Taylor")).toHaveLength(1);
    expect(filterFieldInvoiceHistoryRows(rows, "unpaid", "RO-SPECIAL")).toEqual([]);
  });

  it("summarizes unpaid balances without mixing currencies", () => {
    const rows = buildFieldInvoiceHistoryRows(
      [workOrder("cad"), workOrder("usd"), workOrder("paid")],
      [
        version("cad", "cad", { outstanding_total: 200 }),
        version("usd", "usd", { currency: "USD", outstanding_total: 75 }),
        version("paid", "paid", {
          lifecycle_status: "paid",
          outstanding_total: 0,
        }),
      ],
    );

    expect(summarizeFieldInvoiceHistory(rows)).toEqual({
      unpaidCount: 2,
      paidCount: 1,
      outstandingByCurrency: { CAD: 200, USD: 75 },
    });
  });
});
