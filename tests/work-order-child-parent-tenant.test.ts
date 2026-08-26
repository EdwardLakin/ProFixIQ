import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260825210000_enforce_work_order_child_parent_tenant.sql",
);
const runtime = read(
  "tests/security/work-order-child-parent-tenant.runtime.sql",
);
const lockingRuntime = read(
  "tests/security/work-order-child-parent-tenant-locking.runtime.sh",
);
const workflow = read(".github/workflows/supabase-clean-replay-audit.yml");

describe("Work Order child parent tenant invariant", () => {
  it("enforces parent equality before repair and quote child writes", () => {
    expect(migration).toContain(
      "private.enforce_work_order_child_parent_tenant",
    );
    expect(migration).toMatch(
      /create trigger enforce_work_order_lines_parent_tenant[\s\S]*?before insert or update of work_order_id, shop_id[\s\S]*?private\.enforce_work_order_child_parent_tenant\(\)/,
    );
    expect(migration).toMatch(
      /create trigger enforce_work_order_quote_lines_parent_tenant[\s\S]*?before insert or update of work_order_id, shop_id[\s\S]*?private\.enforce_work_order_child_parent_tenant\(\)/,
    );
    expect(migration).toContain("WORK_ORDER_CHILD_TENANT_MISMATCH");
    expect(migration).toMatch(
      /from public\.work_orders parent[\s\S]*?where parent\.id = new\.work_order_id[\s\S]*?for no key update;/,
    );
    expect(migration).toMatch(
      /create trigger enforce_work_order_parent_tenant_update[\s\S]*?before update\s+on public\.work_orders[\s\S]*?private\.enforce_work_order_parent_tenant_update\(\)/,
    );
    expect(migration).toMatch(
      /create or replace function public\.assign_work_orders_shop_id\(\)[\s\S]*?if new\.shop_id is null[\s\S]*?tg_op = 'UPDATE'[\s\S]*?from public\.shops shop[\s\S]*?public\.current_shop_id\(\)/,
    );
    expect(migration).toContain("position('BEFORE UPDATE ON'");
    expect(migration).toContain(
      "WORK_ORDER_PARENT_TENANT_CHANGE_WITH_CHILDREN",
    );
    expect(migration).toMatch(
      /new\.work_order_id is not distinct from old\.work_order_id[\s\S]*?old\.shop_id is not null[\s\S]*?not exists \([\s\S]*?from public\.shops shop[\s\S]*?shop\.id = old\.shop_id[\s\S]*?new\.shop_id := null/,
    );
    const parentGuard = migration.slice(
      migration.indexOf(
        "create or replace function private.enforce_work_order_parent_tenant_update()",
      ),
      migration.indexOf(
        "revoke all on function private.enforce_work_order_parent_tenant_update()",
      ),
    );
    expect(parentGuard).toMatch(
      /old\.shop_id is not null[\s\S]*?not exists \([\s\S]*?from public\.shops shop[\s\S]*?shop\.id = old\.shop_id[\s\S]*?new\.shop_id := null/,
    );
  });

  it("serializes concurrent child inserts before parent reconciliation", () => {
    expect(lockingRuntime).toContain("work-order-child-lock-probe-a");
    expect(lockingRuntime).toContain("work-order-child-lock-probe-b");
    expect(lockingRuntime).toContain("pg_blocking_pids(contender.pid)");
    expect(lockingRuntime).toContain("pg_advisory_xact_lock(782510, 1)");
    expect(lockingRuntime).toContain("pg_advisory_xact_lock(782510, 2)");
    expect(lockingRuntime).toContain(
      "Concurrent child inserts did not both commit",
    );
    expect(workflow).toContain(
      "tests/security/work-order-child-parent-tenant-locking.runtime.sh",
    );
    expect(workflow).toContain(
      "work-order-child-parent-tenant-locking-runtime.log",
    );
  });

  it("adds restrictive parent checks without replacing role policies", () => {
    for (const policy of [
      "work_order_lines_parent_tenant_insert",
      "work_order_lines_parent_tenant_update",
      "work_order_quote_lines_parent_tenant_insert",
      "work_order_quote_lines_parent_tenant_update",
    ]) {
      const start = migration.indexOf(`create policy ${policy}`);
      expect(start).toBeGreaterThan(0);
      expect(migration.slice(start, start + 420)).toContain("as restrictive");
      expect(migration.slice(start, start + 520)).toContain(
        "rls_helpers.work_order_parent_matches_shop",
      );
    }

    expect(migration).not.toContain("drop policy work_order_lines_role_insert");
    expect(migration).not.toContain("drop policy woql_insert");
    expect(migration).toMatch(
      /revoke all on function rls_helpers\.work_order_parent_matches_shop\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function rls_helpers\.work_order_parent_matches_shop\(uuid, uuid\)[\s\S]*?to authenticated, service_role;/,
    );
  });

  it("fails closed on predecessor mismatches and indexes parent-side quote lookups", () => {
    expect(migration).toContain(
      "create index if not exists idx_work_order_quote_lines_work_order_id",
    );
    const preflightStart = migration.indexOf(
      "create or replace function private.assert_work_order_child_parent_tenants_clean()",
    );
    const preflightEnd = migration.indexOf(
      "comment on function private.assert_work_order_child_parent_tenants_clean()",
    );
    expect(preflightStart).toBeGreaterThan(0);
    expect(preflightEnd).toBeGreaterThan(preflightStart);
    const preflight = migration.slice(preflightStart, preflightEnd);
    expect(preflight).toContain("WORK_ORDER_CHILD_TENANT_PREFLIGHT_FAILED");
    expect(preflight).toContain("'repair_line_count'");
    expect(preflight).toContain("'quote_line_count'");
    expect(preflight).toContain("limit 20");
    expect(preflight).not.toMatch(/\b(?:update|insert into|delete from)\b/i);
    expect(migration).toContain("WORK_ORDER_CHILD_TENANT_PREFLIGHT_OK");
    expect(migration).toMatch(
      /revoke all on function private\.assert_work_order_child_parent_tenants_clean\(\)[\s\S]*?from public, anon, authenticated, service_role;/,
    );
    expect(runtime).toContain(
      "Historical mismatch did not fail the migration preflight",
    );
    expect(runtime).toContain(
      "Migration preflight mutated historical tenant data",
    );
    expect(runtime).toContain(
      "Migration preflight co-mingled historical audit state",
    );
  });

  it("binds SECURITY DEFINER parent reconciliation to the line tenant", () => {
    expect(migration).toMatch(
      /create or replace function public\.refresh_work_order_status\(\)[\s\S]*?parent\.id = new\.work_order_id[\s\S]*?parent\.shop_id is not distinct from new\.shop_id[\s\S]*?private\.reconcile_work_order_state\(new\.work_order_id\)/,
    );
    expect(migration).toMatch(
      /create or replace function public\.refresh_work_order_status_del\(\)[\s\S]*?parent\.shop_id[\s\S]*?parent\.id = old\.work_order_id[\s\S]*?if found then[\s\S]*?v_parent_shop_id is distinct from old\.shop_id[\s\S]*?private\.reconcile_work_order_state\(old\.work_order_id\)/,
    );
  });

  it("covers authenticated and trusted-worker attempts without losing valid derivation", () => {
    expect(runtime).toContain(
      "Authenticated repair line crossed the parent tenant",
    );
    expect(runtime).toContain(
      "Authenticated quote line crossed the parent tenant",
    );
    expect(runtime).toContain(
      "Service role bypassed the repair-line parent tenant invariant",
    );
    expect(runtime).toContain(
      "Service role bypassed the quote-line parent tenant invariant",
    );
    expect(runtime).toContain(
      "Verified parent shop derivation was not preserved",
    );
    expect(runtime).toContain(
      "Denied child write changed the foreign Work Order",
    );
    expect(runtime).toContain(
      "Service role moved a Work Order away from existing children",
    );
    expect(runtime).toContain(
      "Denied parent tenant change modified the Work Order",
    );
    expect(runtime).toContain(
      "Service role manually cleared a parent tenant with children",
    );
    expect(runtime).toContain(
      "Ordinary Work Order update tenant normalization regressed",
    );
    expect(runtime).toContain(
      "Shop cleanup fixture retained an unrelated profile reference",
    );
    expect(runtime).toContain(
      "Shop cleanup bypassed required Work Order tenant history",
    );
    expect(runtime).toContain(
      "Denied Shop cleanup partially mutated tenant data",
    );
    expect(runtime).toContain(
      "Shop cleanup guard did not preserve tenant history",
    );
    expect(runtime).toContain(
      "Authorized Work Order cascade delete did not remove parent and child",
    );
    expect(runtime).toContain("clean_child_tenant_preflight");
  });
});
