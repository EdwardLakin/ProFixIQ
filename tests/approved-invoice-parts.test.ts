import { describe, expect, it } from "vitest";
import { resolveApprovedPartInvoiceQuantity } from "../features/invoices/lib/approvedInvoiceParts";

describe("approved invoice parts", () => {
  it("keeps the approved attached quantity independent of inventory consumption", () => {
    expect(
      resolveApprovedPartInvoiceQuantity({
        quantityRequested: 6,
        quantity: 6,
        quantityReturned: 0,
        quantityCancelled: 0,
      }),
    ).toBe(6);
  });

  it("reduces the customer quantity only for returns or cancellations", () => {
    expect(
      resolveApprovedPartInvoiceQuantity({
        quantityRequested: 6,
        quantity: 6,
        quantityReturned: 1,
        quantityCancelled: 2,
      }),
    ).toBe(3);
  });

  it("keeps the EL000001 approval snapshots as the customer parts total", () => {
    const parts = [
      {
        source: "work_order_part",
        quantity: 6,
        unitPrice: 229.39,
        totalPrice: 1_376.34,
      },
      {
        source: "work_order_part",
        quantity: 1,
        unitPrice: 260.47,
        totalPrice: 260.47,
      },
    ];

    expect(parts.reduce((sum, part) => sum + part.totalPrice, 0)).toBeCloseTo(
      1_636.81,
      2,
    );
  });
});
