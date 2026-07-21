import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveWorkOrderLinePricing } from "../features/work-orders/lib/pricing/resolveWorkOrderLinePricing";

const reviewSource = readFileSync("app/api/work-orders/[id]/_lib/reviewWorkOrder.ts", "utf8");
const billingPage = readFileSync("app/billing/page.tsx", "utf8");
const previewClient = readFileSync("features/work-orders/components/InvoicePreviewPageClient.tsx", "utf8");
const sendRoute = readFileSync("app/api/invoices/send/route.ts", "utf8");
const snapshotSource = readFileSync("features/invoices/server/getInvoiceSnapshot.ts", "utf8");
const billingRoute = readFileSync("app/api/billing/work-orders/route.ts", "utf8");
const invoiceRoute = readFileSync("app/api/work-orders/[id]/invoice/route.ts", "utf8");
const invoicePdfRoute = readFileSync("app/api/work-orders/[id]/invoice-pdf/route.ts", "utf8");
const workOrderView = readFileSync("features/work-orders/app/work-orders/view/page.tsx", "utf8");
const manualPayment = readFileSync("features/invoices/components/RecordManualPayment.tsx", "utf8");

describe("regular live invoice flow safety", () => {
  it("prices 1.0 labor hour from explicit total or labor rate, never as $1.00", () => {
    expect(resolveWorkOrderLinePricing({
      line: { labor_time: 1, labor_total: 150, labor_rate: null },
      shopLaborRate: 125,
    }).laborTotal).toBe(150);

    expect(resolveWorkOrderLinePricing({
      line: { labor_time: 1, labor_total: null, labor_rate: null },
      shopLaborRate: 125,
    }).laborTotal).toBe(125);
  });

  it("blocks AI/invoice review when parts are required but no billable parts are attached", () => {
    expect(reviewSource).toContain("function lineRequiresParts");
    expect(reviewSource).toContain("missing_required_parts");
    expect(reviewSource).toContain("work_order_parts");
    expect(reviewSource).toContain("work_order_part_allocations");
    expect(reviewSource).toContain("part_request_items");
    expect(reviewSource).toContain("hasCanonicalPartsByLine");
    expect(reviewSource).toContain("Required approved parts are not attached");
  });

  it("flags invalid or suspicious labor totals before invoice readiness passes", () => {
    expect(reviewSource).toContain("invalid_labor_total");
    expect(reviewSource).toContain("suspicious_labor_total");
    expect(reviewSource).toContain("Labor total looks like hours were used as dollars");
  });

  it("includes persisted parts and labor in the canonical invoice preview totals", () => {
    expect(snapshotSource).toContain("labor_total");
    expect(snapshotSource).toContain("labor_rate");
    expect(snapshotSource).toContain("work_order_part_allocations");
    expect(snapshotSource).toContain("work_order_parts");
    expect(snapshotSource).toContain("quote_line_part_request");
    expect(previewClient).toContain("/api/work-orders/${workOrderId}/invoice");
    expect(previewClient).toContain("loadedSnapshot?.parts");
    expect(previewClient).toContain("canonicalInvoiceTotal");
  });

  it("uses the canonical approved-parts snapshot for billing, review, and draft PDF surfaces", () => {
    expect(billingPage).toContain('fetch("/api/billing/work-orders"');
    expect(billingPage).toContain("pricing_error");
    expect(billingRoute).toContain("getIssuableInvoiceSnapshot");
    expect(invoiceRoute).toContain("getIssuableInvoiceSnapshot");
    expect(invoicePdfRoute).toContain("getIssuableInvoiceSnapshot");
    expect(billingRoute).toContain("pricing_error");
    expect(billingRoute).not.toContain("catch {");
  });

  it("never turns allocation acquisition cost into a customer invoice price", () => {
    expect(snapshotSource).toContain(
      "Allocation cost is an internal valuation",
    );
    expect(snapshotSource).not.toContain("safeNumber(a.unit_cost) ||");
  });

  it("advances completed work orders through the protected mark-ready route", () => {
    expect(workOrderView).toContain("/api/work-orders/${woId}/mark-ready");
    expect(workOrderView).not.toContain('.update({\n                status: "ready_to_invoice"');
  });

  it("billing Invoice button navigates to preview instead of sending", () => {
    expect(billingPage).toContain("/work-orders/invoice/${row.id}");
    expect(billingPage).toContain("window.location.assign(previewUrl)");
    expect(billingPage).not.toContain('fetch("/api/invoices/send"');
  });

  it("invoice send remains only behind preview confirmation", () => {
    expect(previewClient).toContain("Send invoice");
    expect(previewClient).toContain('fetch("/api/invoices/send"');
    expect(sendRoute).toContain("getIssuableInvoiceSnapshot");
    expect(sendRoute).toContain("draftParts");
    expect(sendRoute).toContain("approved parts were not materialized");
  });

  it("keeps post-issue accounting and manual POS actions reachable", () => {
    expect(billingPage).toContain("Open Invoice");
    expect(previewClient).toContain("SyncInvoiceToQuickBooksButton");
    expect(previewClient).toContain("RecordManualPayment");
    expect(manualPayment).toContain('fetch("/api/payments/manual"');
  });
});
