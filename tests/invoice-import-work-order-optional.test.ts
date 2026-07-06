import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeInvoiceImportStatus, resolveImportedInvoicePaidAt } from "../features/billing/server/invoice-import-job";

const importer = readFileSync("features/billing/server/invoice-import-job.ts", "utf8");
const migration = readFileSync("db/sql/2026-07-06_invoice_import_work_order_optional.sql", "utf8");

describe("historical invoice imports", () => {
  it("keeps the existing matched-work-order-or-null importer behavior", () => {
    expect(importer).toContain("work_order_id: workOrder?.id ?? null");
    expect(importer).not.toContain('from("work_orders").insert');
    expect(importer).not.toContain('from("work_orders").upsert');
  });

  it("marks invoice CSV rows as read-only historical imports", () => {
    expect(importer).toContain("imported: true");
    expect(importer).toContain("read_only: true");
    expect(importer).toContain('import_type: "invoice_csv"');
  });

  it("allows only read-only invoice CSV imports to bypass the active invoice work-order trigger and check", () => {
    expect(migration).toContain("must belong to a work_order");
    expect(migration).toContain("invoice_is_historical_import");
    expect(migration).toContain("p_metadata->>'import_type' = 'invoice_csv'");
    expect(migration).toContain("enforce_invoice_work_order_for_active_invoices");
    expect(migration).toContain("drop constraint if exists invoices_work_order_id_required_chk");
    expect(migration).toContain("add constraint invoices_work_order_id_required_chk");
    expect(migration).toContain("work_order_id is not null");
  });

  it("keeps normal invoice work-order rules protected", () => {
    expect(migration).toContain("or public.invoice_is_historical_import");
    expect(migration).not.toContain("check (true)");
  });

  it("keeps the paid invoice constraint and lets the importer satisfy it", () => {
    expect(migration).toContain("drop constraint if exists invoices_paid_requires_paid_at_chk");
    expect(migration).toContain("add constraint invoices_paid_requires_paid_at_chk");
    expect(migration).toContain("check (status <> 'paid' or paid_at is not null)");
  });

  it("sets paid_at from paid_date for paid imported invoices", () => {
    const paidAt = resolveImportedInvoicePaidAt({ payment_status: "paid", paid_date: "2024-03-20", invoice_date: "2024-03-18" }, "2024-03-18T00:00:00.000Z");
    expect(paidAt).toBe("2024-03-20T00:00:00.000Z");
  });

  it("falls back to invoice_date for paid imported invoices without paid_date", () => {
    const issuedAt = "2024-03-18T00:00:00.000Z";
    expect(resolveImportedInvoicePaidAt({ payment_status: "paid" }, issuedAt)).toBe(issuedAt);
  });

  it("does not require paid_at for unpaid, void, or draft imported invoices", () => {
    expect(normalizeInvoiceImportStatus({ payment_status: "unpaid" })).toBe("imported");
    expect(resolveImportedInvoicePaidAt({ payment_status: "unpaid", paid_date: "2024-03-20" }, "2024-03-18T00:00:00.000Z")).toBeNull();
    expect(resolveImportedInvoicePaidAt({ status: "void" }, "2024-03-18T00:00:00.000Z")).toBeNull();
    expect(resolveImportedInvoicePaidAt({ status: "draft" }, "2024-03-18T00:00:00.000Z")).toBeNull();
  });

  it("preserves legacy invoice and work-order numbers as text metadata", () => {
    expect(importer).toContain("invoice_number: invoiceNumber");
    expect(importer).toContain("work_order_number: workOrderNumber");
  });
});
