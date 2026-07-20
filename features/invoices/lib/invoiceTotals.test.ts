import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "./invoiceTotals";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";

describe("canonical invoice totals", () => {
  it("keeps the EL000001 labor and sell-priced parts fixture consistent", () => {
    const line = resolveWorkOrderLinePricing({
      line: { labor_time: 1, price_estimate: null },
      shopLaborRate: 140,
      stagedParts: [
        { quantity: 6, unit_price: 130, total_price: 780 },
        { quantity: 1, unit_price: 140.4, total_price: 140.4 },
      ],
    });

    expect(line.laborTotal).toBe(140);
    expect(line.partsTotal).toBeCloseTo(920.4, 2);
    expect(line.lineTotal).toBeCloseTo(1060.4, 2);

    const invoice = calculateInvoiceTotals({
      laborCost: line.laborTotal,
      partsCost: line.partsTotal,
      taxRatePercent: 5,
    });
    expect(invoice.subtotal).toBe(1060.4);
    expect(invoice.taxTotal).toBe(53.02);
    expect(invoice.total).toBe(1113.42);
  });

  it("applies supplies, discounts, and tax once at invoice level", () => {
    expect(
      calculateInvoiceTotals({
        laborCost: 200,
        partsCost: 300,
        shopSuppliesTotal: 25,
        discountTotal: 25,
        taxRatePercent: 5,
      }),
    ).toMatchObject({
      subtotal: 525,
      taxableTotal: 500,
      taxTotal: 25,
      total: 525,
    });
  });

  it("does not treat an approved quote grand total as labor", () => {
    const pricing = resolveWorkOrderLinePricing({
      line: {
        labor_time: 2,
        price_estimate: 525,
        intake_json: {
          source: "work_order_quote_lines",
          quote_line_id: "quote-1",
          labor_total: 200,
          parts_total: 300,
          subtotal: 500,
          tax_total: 25,
          grand_total: 525,
        },
      },
      shopLaborRate: 100,
      stagedParts: [{ quantity: 1, unit_price: 300, total_price: 300 }],
    });

    expect(pricing.laborTotal).toBe(200);
    expect(pricing.partsTotal).toBe(300);
    expect(pricing.lineTotal).toBe(500);
  });
});
