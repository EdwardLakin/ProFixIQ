import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const importer = readFileSync("features/billing/server/invoice-import-job.ts", "utf8");
const migration = readFileSync("db/sql/2026-07-06_invoice_import_work_order_optional.sql", "utf8");

describe("historical invoice imports", () => {
  it("keeps the existing matched-work-order-or-null importer behavior", () => {
    expect(importer).toContain("work_order_id: wo?.id ?? null");
    expect(importer).not.toContain("from(\"work_orders\").insert");
    expect(importer).not.toContain("from(\"work_orders\").upsert");
  });

  it("marks invoice CSV rows as read-only historical imports", () => {
    expect(importer).toContain("imported: true");
    expect(importer).toContain("read_only: true");
    expect(importer).toContain('import_type: "invoice_csv"');
  });

  it("allows only read-only invoice CSV imports to bypass the active invoice work-order trigger", () => {
    expect(migration).toContain("must belong to a work_order");
    expect(migration).toContain("invoice_is_historical_import");
    expect(migration).toContain("p_metadata->>'import_type' = 'invoice_csv'");
    expect(migration).toContain("enforce_invoice_work_order_for_active_invoices");
  });
});
