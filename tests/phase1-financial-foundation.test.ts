import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("phase 1 financial foundation", () => {
  it("creates immutable invoice, payment event, receipt, and outbox records", () => {
    const sql = source("supabase/migrations/20260714013000_phase1_financial_foundation.sql");
    expect(sql).toContain("create table if not exists public.invoice_versions");
    expect(sql).toContain("create table if not exists public.payment_events");
    expect(sql).toContain("create table if not exists public.payment_receipts");
    expect(sql).toContain("create table if not exists public.financial_domain_outbox");
    expect(sql).toContain("unique (work_order_id, version_number)");
    expect(sql).toContain("unique (shop_id, operation_key)");
  });

  it("derives both portal and staff checkout from the server-side outstanding balance", () => {
    const portal = source("app/api/portal/payments/checkout/route.ts");
    const staff = source("app/api/stripe/payments/checkout/route.ts");
    for (const route of [portal, staff]) {
      expect(route).toContain("getActiveInvoiceVersion");
      expect(route).toContain("outstanding_total");
      expect(route).toContain('includes(invoiceVersion.lifecycle_status)');
      expect(route).not.toContain("body.amountCents");
    }
  });

  it("issues invoice versions from the canonical snapshot and ignores client totals", () => {
    const route = source("app/api/invoices/send/route.ts");
    expect(route).toContain("getInvoiceSnapshotForWorkOrder");
    expect(route).toContain("finalizeInvoiceVersion");
    expect(route).not.toContain("invoiceTotal?: number");
    expect(route).not.toContain("body?.invoiceTotal");
  });

  it("renders portal invoices and PDFs from the persisted version snapshot", () => {
    const portal = source("app/portal/invoices/[id]/page.tsx");
    const pdf = source("app/api/invoice-versions/[id]/pdf/route.ts");
    expect(portal).toContain("selectedVersion.snapshot");
    expect(portal).not.toContain('from("work_order_part_allocations")');
    expect(pdf).toContain("version.snapshot");
    expect(pdf).not.toContain("getInvoiceSnapshotForWorkOrder");
  });

  it("posts successful, failed, refunded, and disputed Stripe events to the ledger", () => {
    const webhook = source("features/stripe/api/stripe/webhook/route.ts");
    expect(webhook).toContain('case "checkout.session.completed"');
    expect(webhook).toContain('case "payment_intent.payment_failed"');
    expect(webhook).toContain('case "charge.refunded"');
    expect(webhook).toContain('case "charge.dispute.created"');
    expect(webhook).toContain("postPaymentEvent");
  });

  it("uses immutable invoice versions and deterministic recovery for QuickBooks", () => {
    const quickBooks = source("features/integrations/quickbooks/server/syncInvoice.ts");
    expect(quickBooks).toContain("getInvoiceVersionById");
    expect(quickBooks).toContain("findQuickBooksInvoiceByDocNumber");
    expect(quickBooks).toContain("invoice_version_id");
    expect(quickBooks).not.toContain("getInvoiceSnapshotForWorkOrder");
  });

  it("provides manual posting, reversal, voiding, verified receipts, and notification delivery", () => {
    expect(source("app/api/payments/manual/route.ts")).toContain('eventKind: "manual_payment"');
    expect(source("app/api/payments/manual/reverse/route.ts")).toContain('eventKind: "manual_reversal"');
    expect(source("app/api/invoices/versions/[id]/void/route.ts")).toContain("void_invoice_version");
    expect(source("app/api/portal/payments/session/[id]/route.ts")).toContain("payment_receipts");
    expect(source("features/invoices/server/processFinancialOutbox.ts")).toContain("financial_domain_outbox");
  });
});
