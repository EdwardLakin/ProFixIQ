import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCustomerLookupMaps,
  normalizeInvoiceImportStatus,
  resolveImportedInvoicePaidAt,
  resolveInvoiceImportCustomer,
} from "../features/billing/server/invoice-import-job";

const importer = readFileSync(
  "features/billing/server/invoice-import-job.ts",
  "utf8",
);
const migration = readFileSync(
  "db/sql/2026-07-06_invoice_import_work_order_optional.sql",
  "utf8",
);

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
    expect(migration).toContain(
      "enforce_invoice_work_order_for_active_invoices",
    );
    expect(migration).toContain(
      "drop constraint if exists invoices_work_order_id_required_chk",
    );
    expect(migration).toContain(
      "add constraint invoices_work_order_id_required_chk",
    );
    expect(migration).toContain("work_order_id is not null");
  });

  it("keeps normal invoice work-order rules protected", () => {
    expect(migration).toContain("or public.invoice_is_historical_import");
    expect(migration).not.toContain("check (true)");
  });

  it("keeps the paid invoice constraint and lets the importer satisfy it", () => {
    expect(migration).toContain(
      "drop constraint if exists invoices_paid_requires_paid_at_chk",
    );
    expect(migration).toContain(
      "add constraint invoices_paid_requires_paid_at_chk",
    );
    expect(migration).toContain(
      "check (status <> 'paid' or paid_at is not null)",
    );
  });

  it("sets paid_at from paid_date for paid imported invoices", () => {
    const paidAt = resolveImportedInvoicePaidAt(
      {
        payment_status: "paid",
        paid_date: "2024-03-20",
        invoice_date: "2024-03-18",
      },
      "2024-03-18T00:00:00.000Z",
    );
    expect(paidAt).toBe("2024-03-20T00:00:00.000Z");
  });

  it("falls back to invoice_date for paid imported invoices without paid_date", () => {
    const issuedAt = "2024-03-18T00:00:00.000Z";
    expect(
      resolveImportedInvoicePaidAt({ payment_status: "paid" }, issuedAt),
    ).toBe(issuedAt);
  });

  it("does not require paid_at for unpaid, void, or draft imported invoices", () => {
    expect(normalizeInvoiceImportStatus({ payment_status: "unpaid" })).toBe(
      "issued",
    );
    expect(
      resolveImportedInvoicePaidAt(
        { payment_status: "unpaid", paid_date: "2024-03-20" },
        "2024-03-18T00:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      resolveImportedInvoicePaidAt(
        { status: "void" },
        "2024-03-18T00:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      resolveImportedInvoicePaidAt(
        { status: "draft" },
        "2024-03-18T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("normalizes common CSV invoice statuses to canonical database statuses", () => {
    expect(normalizeInvoiceImportStatus({ payment_status: "open" })).toBe(
      "issued",
    );
    expect(normalizeInvoiceImportStatus({ payment_status: "partial" })).toBe(
      "issued",
    );
    expect(
      normalizeInvoiceImportStatus({ payment_status: "partially_paid" }),
    ).toBe("issued");
    expect(
      normalizeInvoiceImportStatus({ payment_status: "paid_in_full" }),
    ).toBe("paid");
    expect(
      normalizeInvoiceImportStatus({ payment_status: "closed_paid" }),
    ).toBe("paid");
    expect(normalizeInvoiceImportStatus({ payment_status: "void" })).toBe(
      "void",
    );
    expect(normalizeInvoiceImportStatus({ payment_status: "cancelled" })).toBe(
      "void",
    );
    expect(
      normalizeInvoiceImportStatus({ payment_status: "written_off" }),
    ).toBe("void");
    expect(
      normalizeInvoiceImportStatus({ payment_status: "credit" }),
    ).toBeNull();
    expect(
      normalizeInvoiceImportStatus({ payment_status: "refunded" }),
    ).toBeNull();
  });

  it("preserves legacy invoice and work-order numbers as text metadata", () => {
    expect(importer).toContain("invoice_number: invoiceNumber");
    expect(importer).toContain("work_order_number: workOrderNumber");
  });

  it("supports imported invoice customer matching sources and fallback ordering", () => {
    expect(importer).toContain("customer_email");
    expect(importer).toContain("customer_phone");
    expect(importer).toContain("customer_name");
    expect(importer).toContain("const fallbackCustomerId =");
    expect(importer).toContain(
      "vehicle?.customer_id ?? workOrder?.customer_id ?? null",
    );
    expect(importer).toContain(
      "customer_match_source: customerMatchSourceResolved",
    );
    expect(importer).toContain("vehicle_match_source: vehicleMatchSource");
    expect(importer).toContain("matched_customer_id: customerId");
    expect(importer).toContain("matched_vehicle_id: vehicleId");
  });

  it("matches raw customer_id to customers.external_id and assigns the matched customer UUID", () => {
    const matchedCustomer = {
      id: "a59bf3dd-4ae9-4f31-874c-e29a5ca2634e",
      external_id: "CUST-101566",
      name: "Emily Clark",
    };

    const result = resolveInvoiceImportCustomer(
      { customer_id: "CUST-101566" },
      buildCustomerLookupMaps([matchedCustomer]),
    );

    expect(result.legacyCustomerId).toBe("CUST-101566");
    expect(result.customer?.id).toBe("a59bf3dd-4ae9-4f31-874c-e29a5ca2634e");
    expect(result.customerMatchSource).toBe("customer_external_id");
    expect(importer).toContain("customer_id: customerId");
    expect(importer).toContain("legacy_customer_id: legacyCustomerId");
    expect(importer).toContain("matched_customer_id: customerId");
    expect(importer).toContain(
      "customer_match_source: customerMatchSourceResolved",
    );
  });

  it("counts duplicate imported invoices as skipped rather than failed", () => {
    expect(importer).toContain("counts.skipped++");
    expect(importer).toContain("counts.duplicates++");
    expect(importer).toContain("Duplicate invoice already exists.");
    expect(importer).toContain("Duplicates are counted as skipped rows.");
  });
});
