import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const migrationPath =
  "supabase/migrations/20261007183500_ops_marketing_funnel_snapshot.sql";
const lifecycleMigrationPath =
  "supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql";

describe("Ops marketing funnel", () => {
  it("keeps the reader behind the existing Ops authorization boundary", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("await requireOpsOperatorPageAccess()");
    expect(reader).toContain("const admin = createAdminSupabase()");
  });

  it("uses task-owned service-role RPCs without changing marketing_events privileges", () => {
    const migration = source(migrationPath);
    const lifecycleMigration = source(lifecycleMigrationPath);

    expect(migration).toContain(
      "create or replace function public.get_ops_marketing_funnel_snapshot(",
    );
    expect(lifecycleMigration).toContain(
      "create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(",
    );
    expect(migration).toContain("security definer");
    expect(lifecycleMigration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(lifecycleMigration).toContain(
      "set search_path = pg_catalog, public",
    );
    expect(migration).not.toContain(
      "grant select on table public.marketing_events",
    );
    expect(migration).not.toContain(
      "revoke select on table public.marketing_events",
    );
    expect(lifecycleMigration).not.toContain(
      "grant select on table public.marketing_events",
    );
    expect(lifecycleMigration).not.toContain(
      "revoke select on table public.marketing_events",
    );
  });

  it("reads acquisition detail and lifecycle counts through one wrapper statement", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");
    const migration = source(migrationPath);
    const lifecycleMigration = source(lifecycleMigrationPath);

    expect(reader).toContain(
      '"get_ops_marketing_lifecycle_funnel_snapshot"',
    );
    expect(reader).not.toContain('.from("marketing_events")');
    expect(reader).not.toContain(".range(");
    expect(lifecycleMigration).toContain(
      "select public.get_ops_marketing_funnel_snapshot(",
    );
    expect(migration).toContain("with base as materialized (");
    expect(migration).toContain("from public.marketing_events as me");
    expect(migration).toContain("from base");
    expect(migration).toContain("order by created_at desc, id desc");
    expect(migration).toContain(
      "limit least(greatest(coalesce(p_breakdown_limit, 20000), 0), 20000)",
    );
    expect(migration).toContain(
      "'breakdownTruncated', s.total_events > r.row_count",
    );
  });

  it("counts checkout intent only when a canonical checkout attempt exists", () => {
    const migration = source(migrationPath);
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(migration).toContain("event_name = 'marketing_trial_click'");
    expect(migration).toContain("event_name = 'marketing_subscribe_click'");
    expect(migration.match(/checkout_attempt_id is not null/g)).toHaveLength(2);
    expect(reader).toContain("const checkoutIntent = isCheckoutIntent(row)");
  });

  it("keeps checkout attempt identifiers server-side and omits anonymous identifiers", () => {
    const migration = source(migrationPath);
    const reader = source("features/ops/server/get-marketing-funnel.ts");
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(migration).toContain("'checkout_attempt_id', checkout_attempt_id");
    expect(migration).not.toContain("anonymous_session_id");
    expect(reader).not.toContain("anonymous_session_id");
    expect(component).not.toContain("checkout_attempt_id");
    expect(component).not.toContain("anonymous_session_id");
  });

  it("filters source dimensions and retains unattributed lifecycle activity", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain("isAcquisitionMarketingPath(value)");
    expect(reader).toContain("canonicalSourcePath(row.source_path)");
    expect(reader).toContain('const UNATTRIBUTED_SOURCE = "Unattributed"');
    expect(reader).toContain("isAttemptAttributedLifecycleEvent(row)");
    expect(reader).toContain(
      "sourceByAttempt.get(row.checkout_attempt_id) ?? UNATTRIBUTED_SOURCE",
    );
  });

  it("retains legacy and null-package lifecycle activity in an explicit package bucket", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(reader).toContain(
      'const UNATTRIBUTED_PACKAGE = "Legacy / unattributed"',
    );
    expect(reader).toContain("function packageKeyForRow(row: MarketingEventRow)");
    expect(reader).toContain(
      "isAttemptAttributedLifecycleEvent(row) || isCheckoutIntent(row)",
    );
    expect(reader).toContain("const packageKey = packageKeyForRow(row)");
  });

  it("keeps the generated Supabase RPC contracts in sync", () => {
    const generated = source("features/shared/types/types/supabase.ts");

    expect(generated).toContain("get_ops_marketing_funnel_snapshot: {");
    expect(generated).toContain(
      "get_ops_marketing_lifecycle_funnel_snapshot: {",
    );
    expect(generated).toContain("p_breakdown_limit: number");
    expect(generated).toContain("p_since: string");
  });

  it("surfaces the acquisition lifecycle and progression views", () => {
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(component).toContain("By source page");
    expect(component).toContain("By product package");
    expect(component).toContain("Trial checkout intent");
    expect(component).toContain("Paid checkout intent");
    expect(component).toContain("Checkout starts");
    expect(component).toContain("Signup completed");
    expect(component).toContain("Onboarding completed");
    expect(component).toContain("Intent → checkout");
    expect(component).toContain("Checkout → signup");
    expect(component).toContain("Signup → onboarding");
    expect(component).toContain("event volume");
    expect(component).toContain("not unique visitors");
  });

  it("adds the funnel to Ops navigation and keeps the page dynamic", () => {
    const shell = source("features/ops/components/OpsShell.tsx");
    const page = source("app/ops/marketing-funnel/page.tsx");

    expect(shell).toContain('href: "/ops/marketing-funnel"');
    expect(shell).toContain('label: "Acquisition Funnel"');
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("getOpsMarketingFunnel()");
  });
});
