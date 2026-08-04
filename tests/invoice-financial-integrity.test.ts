import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const migrationPath =
  "supabase/migrations/20260803174543_fix_invoice_financial_integrity.sql";

describe("invoice financial integrity repair", () => {
  it("persists shop supplies and computes subtotal, discount, tax, and total once", () => {
    const migration = source(migrationPath);
    expect(migration).toContain(
      "add column if not exists shop_supplies_total numeric(14,2)",
    );
    expect(migration).toContain(
      "new.subtotal := greatest(v_labor + v_parts + v_supplies, 0)",
    );
    expect(migration).toContain(
      "new.total := greatest(new.subtotal - v_discount + v_tax, 0)",
    );
    expect(migration).toContain(
      "update of\n  labor_cost,\n  parts_cost,\n  shop_supplies_total",
    );
  });

  it("uses the installed pgcrypto schema and converts the AI source enum", () => {
    const migration = source(migrationPath);
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("p_training_source::public.ai_training_source");
    expect(migration).toContain("set search_path = ''");
  });

  it("atomically owns mutable invoice persistence and immutable issuance", () => {
    const migration = source(migrationPath);
    expect(migration).toContain("from public.work_orders wo");
    expect(migration).toContain("for update;");
    expect(migration).toContain("insert into public.invoices (");
    expect(migration).toContain("insert into public.invoice_versions (");
    expect(migration).toContain("insert into public.financial_domain_outbox (");
    expect(migration).toContain(
      "revoke all on function public.finalize_invoice_version",
    );
    expect(migration).toContain("to service_role;");
  });

  it("keeps draft writes out of HTTP routes and makes attachments non-blocking", () => {
    const finalize = source("app/api/invoices/finalize/route.ts");
    const send = source("app/api/invoices/send/route.ts");
    expect(finalize).not.toContain('.from("invoices")');
    expect(finalize).toContain("finalizedWithWarnings");
    expect(send).not.toContain('status: "draft"');
    expect(send).toContain("issuanceWarnings");
  });

  it("reads the persisted shop-supplies amount for issued snapshots", () => {
    const snapshot = source("features/invoices/server/getInvoiceSnapshot.ts");
    expect(snapshot).toContain("invoice?.shop_supplies_total");
    expect(snapshot).toContain(
      "labor_cost, shop_supplies_total, discount_total",
    );
  });
});
