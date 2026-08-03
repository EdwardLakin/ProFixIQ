import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("invoice and work-order workflow completion", () => {
  it("uses actionable board statuses and keeps direct technician assignment", () => {
    const board = source("features/work-orders/app/work-orders/view/page.tsx");
    expect(board).not.toContain("Waiting on the next operational dependency");
    expect(board).toContain("Waiting for parts");
    expect(board).toContain("Needs customer approval");
    expect(board).toContain("Waiting for next step");
    expect(board).toContain('fetch("/api/work-orders/assign-all"');
    expect(board).toContain("Choose a technician first.");
  });

  it("exposes the empty-work-order add-job action", () => {
    const detail = source("app/work-orders/[id]/Client.tsx");
    expect(detail).toContain("setAddJobOpen(true)");
    expect(detail).toContain("<AddJobModal");
    expect(detail).toContain("Add job");
  });

  it("separates finalization from delivery and reuses an issued version", () => {
    const preview = source(
      "features/work-orders/components/InvoicePreviewPageClient.tsx",
    );
    const finalize = source("app/api/invoices/finalize/route.ts");
    const send = source("app/api/invoices/send/route.ts");
    expect(preview).toContain("Approve & finalize");
    expect(preview).toContain('fetch("/api/invoices/finalize"');
    expect(preview).toContain("Print invoice");
    expect(finalize).toContain("getActiveInvoiceVersion");
    expect(finalize).toContain("documentConfiguration: brand.document");
    expect(finalize).toContain("invoicePartSignature");
    expect(finalize).toContain('status: "draft"');
    expect(finalize).toContain("issued_at: null");
    expect(finalize).not.toContain("issued_pending_send");
    expect(finalize).not.toContain("invoiceUpdateError");
    expect(send).toContain("if (version)");
    expect(send).toContain("snapshot = version.snapshot");
    expect(send).toContain('status: "draft"');
    expect(send).not.toContain("issued_pending_send");
    expect(preview).toContain("Invoice finalization failed");
    expect(preview).toContain("toast.error(message)");
  });

  it("allows delivery metadata updates after the financial snapshot is locked", () => {
    const migration = source(
      "supabase/migrations/20260803173514_invoice_finalize_production_contract.sql",
    );
    expect(migration).toContain("invoice_sent_at");
    expect(migration).toContain("invoice_last_sent_to");
    expect(migration).toContain("invoice_url");
    expect(migration).toContain("invoice_pdf_url");
    expect(migration).toContain("WORK_ORDER_FINANCIALLY_LOCKED");
  });

  it("keeps payment and QuickBooks actions on the immutable invoice", () => {
    const preview = source(
      "features/work-orders/components/InvoicePreviewPageClient.tsx",
    );
    expect(preview).toContain("<RecordManualPayment");
    expect(preview).toContain("<SyncInvoiceToQuickBooksButton");
    expect(preview).toContain("disabled={!activeInvoiceVersion}");
    expect(source("app/api/payments/manual/route.ts")).toContain(
      "postPaymentEvent",
    );
  });

  it("supports invoice-only pricing overrides and locks them after issuance", () => {
    const editor = source(
      "features/invoices/components/InvoicePricingEditor.tsx",
    );
    const route = source("app/api/invoices/pricing-overrides/route.ts");
    const snapshot = source("features/invoices/server/getInvoiceSnapshot.ts");
    const migration = source(
      "supabase/migrations/20260803034531_complete_invoice_workflow_controls.sql",
    );
    expect(editor).toContain("Edit pricing");
    expect(editor).toContain('fetch("/api/invoices/pricing-overrides"');
    expect(route).toContain("if (activeVersion)");
    expect(route).toContain("Issued invoice pricing is locked");
    expect(snapshot).toContain("lineLaborOverrides");
    expect(snapshot).toContain("partPriceOverrides");
    expect(migration).toContain("invoice_pricing_overrides_shop_read");
    expect(migration).toContain(
      "grant select on public.invoice_pricing_overrides to authenticated",
    );
  });
});
