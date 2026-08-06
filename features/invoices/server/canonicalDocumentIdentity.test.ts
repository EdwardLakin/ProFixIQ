import { describe, expect, it } from "vitest";

import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";
import { overlayCanonicalDocumentIdentity } from "./canonicalDocumentIdentity";

function snapshotFixture(): InvoiceSnapshot {
  return {
    workOrder: {
      id: "work-order-id",
      shop_id: "shop-id",
      customer_id: "customer-id",
      vehicle_id: "vehicle-id",
      customer_name: "Customer",
      custom_id: null,
      status: "invoiced",
      labor_total: 100,
      parts_total: 50,
      invoice_total: 165,
      shop_supplies_enabled_override: null,
      shop_supplies_amount_override: null,
      created_at: "2026-08-05T00:00:00.000Z",
    },
    invoice: {
      id: "invoice-id",
      invoice_number: null,
      status: "paid",
      currency: "CAD",
      subtotal: 165,
      parts_cost: 50,
      labor_cost: 100,
      shop_supplies_total: 15,
      discount_total: 0,
      tax_total: 0,
      total: 165,
      issued_at: "2026-08-05T01:00:00.000Z",
      created_at: "2026-08-05T01:00:00.000Z",
      notes: null,
    },
    shop: null,
    customer: null,
    vehicle: null,
    lines: [],
    parts: [],
    currency: "CAD",
    laborCost: 100,
    partsCost: 50,
    shopSuppliesTotal: 15,
    subtotal: 165,
    discountTotal: 0,
    taxTotal: 0,
    total: 165,
  };
}

describe("canonical invoice document identity", () => {
  it("overlays repaired customer-facing numbers without mutating the frozen snapshot", () => {
    const original = snapshotFixture();
    const overlaid = overlayCanonicalDocumentIdentity(original, {
      workOrderNumber: "WO-000009",
      invoiceNumber: "INV-000003",
    });

    expect(overlaid.workOrder.custom_id).toBe("WO-000009");
    expect(overlaid.invoice?.invoice_number).toBe("INV-000003");
    expect(original.workOrder.custom_id).toBeNull();
    expect(original.invoice?.invoice_number).toBeNull();
  });
});
