import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const migrationPath =
  "supabase/migrations/20260819153500_harden_invoice_write_rls.sql";

describe("invoice write RLS hardening", () => {
  it("retires the same-shop FOR ALL policy and splits invoice mutations by operation", () => {
    const migration = source(migrationPath);

    expect(migration).toContain(
      "drop policy if exists invoices_modify_by_shop on public.invoices",
    );
    expect(migration).toContain("create policy invoices_billing_insert");
    expect(migration).toContain("create policy invoices_billing_update");
    expect(migration).toContain("create policy invoices_billing_delete");
    expect(migration).not.toContain("create policy invoices_modify_by_shop");
  });

  it("binds every authenticated invoice mutation to the actor shop and billing roles", () => {
    const migration = source(migrationPath);
    const roleClause =
      "'owner', 'admin', 'manager', 'advisor', 'service'";

    expect(migration.match(/shop_id = \(select public\.current_shop_id\(\)\)/g)).toHaveLength(4);
    expect(migration.match(/select public\.profixiq_current_role\(\)/g)).toHaveLength(4);
    expect(migration.match(new RegExp(roleClause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(4);
  });

  it("removes TRUNCATE from API-facing roles because RLS cannot constrain it", () => {
    const migration = source(migrationPath);
    expect(migration).toContain(
      "revoke truncate on table public.invoices from anon, authenticated",
    );
  });

  it("keeps the application billing-operator role contract aligned", () => {
    const rbac = source("features/shared/lib/rbac.ts");
    expect(rbac).toContain(
      'billingOperators: ["owner", "admin", "manager", "advisor", "service"]',
    );

    const sendRoute = source("app/api/invoices/send/route.ts");
    expect(sendRoute).toContain(
      'allowRoles: ["owner", "admin", "manager", "advisor", "service"]',
    );
  });
});
