import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveWorkOrderLinePricing } from "../features/work-orders/lib/pricing/resolveWorkOrderLinePricing";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("invoice flow financial integrity", () => {
  it("billing cards load canonical server snapshots instead of raw work-order rows", () => {
    const page = source("app/billing/page.tsx");
    expect(page).toContain('fetch("/api/billing/work-orders"');
    expect(page).not.toContain('.from("work_orders")\n        .select(');
    expect(page).toContain("resolved_labor_total");
    expect(page).toContain("resolved_parts_total");
    expect(page).toContain("resolved_invoice_total");
  });

  it("billing snapshot failures are not converted into zero-dollar invoices", () => {
    const route = source("app/api/billing/work-orders/route.ts");
    expect(route).toContain("getInvoiceSnapshotForWorkOrder");
    expect(route).toContain("Failed to resolve invoice totals");
    expect(route).toContain("{ ok: false, error: snapshotResults.error }");
    expect(route).not.toContain("resolved_labor_total: 0,\n          resolved_parts_total: 0");
  });

  it("new invoice snapshots include shop supplies overrides and shop tax rate", () => {
    const snapshot = source("features/invoices/server/getInvoiceSnapshot.ts");
    expect(snapshot).toContain("shop_supplies_enabled_override");
    expect(snapshot).toContain("shop_supplies_amount_override");
    expect(snapshot).toContain("tax_rate");
    expect(snapshot).toContain("taxRateFraction(shop?.tax_rate)");
  });

  it("allocated parts use catalog sell price before allocation cost", () => {
    const snapshot = source("features/invoices/server/getInvoiceSnapshot.ts");
    expect(snapshot).toContain("id, name, sku, part_number, unit, price, supplier");
    expect(snapshot).toContain("safeNumberOrNull(p?.price) ?? safeNumber(a.unit_cost)");
    expect(snapshot).toContain("unit_price: safeNumberOrNull(catalogPart?.price) ?? safeNumber(part.unit_cost)");
  });

  it("focused job pricing uses the shop labor rate", () => {
    const modal = source("features/work-orders/components/workorders/FocusedJobModal.tsx");
    expect(modal).toContain('select("labor_rate")');
    expect(modal).toContain("const [shopLaborRate, setShopLaborRate]");
    expect(modal).toContain("resolveWorkOrderLinePricing({ line, shopLaborRate");
    expect(modal).not.toContain("shopLaborRate: null");
  });

  it("stale zero quote totals do not override known labor totals", () => {
    expect(
      resolveWorkOrderLinePricing({
        line: { labor_time: 1, labor_total: null, labor_rate: null },
        quote: { grand_total: 0 },
        shopLaborRate: 140,
      }).lineTotal,
    ).toBe(140);

    expect(
      resolveWorkOrderLinePricing({
        line: { labor_time: 1.5, labor_total: null, labor_rate: null },
        quote: { subtotal: 0 },
        shopLaborRate: 140,
      }).lineTotal,
    ).toBe(210);
  });
});
