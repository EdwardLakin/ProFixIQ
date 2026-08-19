import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const migrationPath =
  "supabase/migrations/20260819153500_harden_invoice_write_rls.sql";

describe("financial write RLS hardening", () => {
  it("retires both legacy same-shop FOR ALL invoice policies and splits invoice mutations by operation", () => {
    const migration = source(migrationPath);

    expect(migration).toContain(
      "drop policy if exists invoices_modify_by_shop on public.invoices",
    );
    expect(migration).toContain(
      "drop policy if exists invoices_shop_crud on public.invoices",
    );
    expect(migration).toContain("create policy invoices_billing_insert");
    expect(migration).toContain("create policy invoices_billing_update");
    expect(migration).toContain("create policy invoices_billing_delete");
    expect(migration).not.toContain("create policy invoices_modify_by_shop");
    expect(migration).not.toContain("create policy invoices_shop_crud");
  });

  it("binds every authenticated invoice mutation to the actor shop and billing roles", () => {
    const migration = source(migrationPath);
    const roleClause =
      "'owner', 'admin', 'manager', 'advisor', 'service'";

    expect(
      migration.match(/shop_id = \(select public\.current_shop_id\(\)\)/g),
    ).toHaveLength(4);
    expect(
      migration.match(/select public\.profixiq_current_role\(\)/g),
    ).toHaveLength(4);
    expect(migration.split(roleClause).length - 1).toBe(4);
  });

  it("retire bootstrap payment DML and unconstrained API-role TRUNCATE privileges", () => {
    const migration = source(migrationPath);
    expect(migration).toContain(
      "drop policy if exists payments_shop_crud on public.payments",
    );
    expect(migration).toContain(
      "revoke insert, update, delete, truncate on table public.payments\n  from anon, authenticated",
    );
    expect(migration).toContain(
      "revoke truncate on table public.invoices from anon, authenticated",
    );
  });

  it("keeps the application billing-operator and server payment contracts aligned", () => {
    const rbac = source("features/shared/lib/rbac.ts");
    expect(rbac).toContain(
      'billingOperators: ["owner", "admin", "manager", "advisor", "service"]',
    );

    const sendRoute = source("app/api/invoices/send/route.ts");
    expect(sendRoute).toContain(
      'allowRoles: ["owner", "admin", "manager", "advisor", "service"]',
    );

    const manualPaymentRoute = source("app/api/payments/manual/route.ts");
    expect(manualPaymentRoute).toContain(
      'const PAYMENT_ROLES = ["owner", "admin", "manager", "advisor", "service"] as const',
    );
    expect(manualPaymentRoute).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(manualPaymentRoute).toContain("postPaymentEvent");
  });
});
