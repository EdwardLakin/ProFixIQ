import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const invoiceMigrationPath =
  "supabase/migrations/20260819153500_harden_invoice_write_rls.sql";
const bootstrapDriftMigrationPath =
  "supabase/migrations/20260819160000_harden_financial_bootstrap_policy_drift.sql";
const readPolicyMigrationPath =
  "supabase/migrations/20260819162500_reconcile_financial_read_policies.sql";
const portalInvoiceMigrationPath =
  "supabase/migrations/20260819163500_bind_invoice_portal_read_to_invite.sql";
const financialReadScopeMigrationPath =
  "supabase/migrations/20260819165000_restrict_financial_staff_reads.sql";
const canonicalCustomerVisibilityMigrationPath =
  "supabase/migrations/20260819170500_reconcile_customer_financial_visibility.sql";

describe("financial RLS hardening", () => {
  it("retires both legacy same-shop FOR ALL invoice policies and splits invoice mutations by operation", () => {
    const invoiceMigration = source(invoiceMigrationPath);
    const driftMigration = source(bootstrapDriftMigrationPath);

    expect(invoiceMigration).toContain(
      "drop policy if exists invoices_modify_by_shop on public.invoices",
    );
    expect(driftMigration).toContain(
      "drop policy if exists invoices_shop_crud on public.invoices",
    );
    expect(invoiceMigration).toContain("create policy invoices_billing_insert");
    expect(invoiceMigration).toContain("create policy invoices_billing_update");
    expect(invoiceMigration).toContain("create policy invoices_billing_delete");
    expect(invoiceMigration).not.toContain("create policy invoices_modify_by_shop");
    expect(driftMigration).not.toContain("create policy invoices_shop_crud");
  });

  it("binds every authenticated invoice mutation to the actor shop and billing roles", () => {
    const migration = source(invoiceMigrationPath);
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

  it("retires bootstrap payment DML and unconstrained API-role TRUNCATE privileges", () => {
    const invoiceMigration = source(invoiceMigrationPath);
    const driftMigration = source(bootstrapDriftMigrationPath);

    expect(driftMigration).toContain(
      "drop policy if exists payments_shop_crud on public.payments",
    );
    expect(driftMigration).toContain(
      "revoke insert, update, delete, truncate on table public.payments\n  from anon, authenticated",
    );
    expect(invoiceMigration).toContain(
      "revoke truncate on table public.invoices from anon, authenticated",
    );
  });

  it("reconciles financial reads without restoring direct payment writes", () => {
    const migration = source(readPolicyMigrationPath);

    expect(migration).toContain("create policy invoices_staff_select");
    expect(migration).toContain("shop_id = (select public.current_shop_id())");
    expect(migration).toContain("create policy payments_staff_select");
    expect(migration).not.toContain("create policy payments_shop_crud");
  });

  it("restricts same-shop invoice and payment reads to billing operators", () => {
    const migration = source(financialReadScopeMigrationPath);
    const roleClause =
      "'owner', 'admin', 'manager', 'advisor', 'service'";

    expect(migration).toContain("drop policy if exists invoices_staff_select");
    expect(migration).toContain("create policy invoices_staff_select");
    expect(migration).toContain("drop policy if exists payments_staff_select");
    expect(migration).toContain("create policy payments_staff_select");
    expect(
      migration.match(/shop_id = \(select public\.current_shop_id\(\)\)/g),
    ).toHaveLength(2);
    expect(
      migration.match(/select public\.profixiq_current_role\(\)/g),
    ).toHaveLength(2);
    expect(migration.split(roleClause).length - 1).toBe(2);
  });

  it("supersedes the initial invoice-only portal predicate with the canonical work-order contract", () => {
    const initialMigration = source(portalInvoiceMigrationPath);
    const finalMigration = source(canonicalCustomerVisibilityMigrationPath);

    expect(initialMigration).toContain(
      "public.profixiq_is_portal_customer_for(customer_id, shop_id)",
    );
    expect(finalMigration).toContain(
      "drop policy if exists invoices_customer_select on public.invoices",
    );
    expect(finalMigration).toContain("wo.id = invoices.work_order_id");
    expect(finalMigration).toContain("wo.shop_id = invoices.shop_id");
    expect(finalMigration).toContain(
      "invoices.customer_id = wo.customer_id",
    );
    expect(finalMigration).toContain(
      "public.profixiq_is_portal_customer_for(wo.customer_id, wo.shop_id)",
    );
    expect(finalMigration).toContain("iv.invoice_id = invoices.id");
    expect(finalMigration).toContain(
      "'issued', 'partially_paid', 'paid', 'voided', 'superseded', 'credited'",
    );
  });

  it("removes legacy customer.user_id shortcuts from every canonical financial table", () => {
    const migration = source(canonicalCustomerVisibilityMigrationPath);

    for (const legacyPolicy of [
      "invoice_versions_staff_or_customer_select",
      "payment_events_staff_or_customer_select",
      "payment_receipts_staff_or_customer_select",
    ]) {
      expect(migration).toContain(`drop policy if exists ${legacyPolicy}`);
    }

    for (const customerPolicy of [
      "invoice_versions_customer_select",
      "payment_events_customer_select",
      "payment_receipts_customer_select",
    ]) {
      expect(migration).toContain(`create policy ${customerPolicy}`);
    }

    expect(migration).not.toContain("c.user_id = auth.uid()");
    expect(
      migration.match(
        /public\.profixiq_is_portal_customer_for\(wo\.customer_id, wo\.shop_id\)/g,
      ),
    ).toHaveLength(4);
  });

  it("keeps canonical financial snapshots role-scoped for staff", () => {
    const migration = source(canonicalCustomerVisibilityMigrationPath);
    const roleClause =
      "'owner', 'admin', 'manager', 'advisor', 'service'";

    for (const staffPolicy of [
      "invoice_versions_staff_select",
      "payment_events_staff_select",
      "payment_receipts_staff_select",
    ]) {
      expect(migration).toContain(`create policy ${staffPolicy}`);
    }

    expect(migration.split(roleClause).length - 1).toBe(3);
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
    expect(manualPaymentRoute).toContain("const PAYMENT_ROLES = [");
    expect(manualPaymentRoute).toContain(
      "requiredWorkspaceCapability: WORKSPACE_CAPABILITIES.manageWorkOrderInvoice",
    );
    expect(manualPaymentRoute).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(manualPaymentRoute).toContain("postPaymentEvent");
  });
});
