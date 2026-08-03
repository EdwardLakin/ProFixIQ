import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migrationPath =
  "supabase/migrations/20260714030000_phase2_financial_lifecycle_protection.sql";

describe("phase 2 financial lifecycle protection", () => {
  it("creates audited correction sessions with one open session per work order", () => {
    const sql = source(migrationPath);
    expect(sql).toContain("create table if not exists public.work_order_correction_sessions");
    expect(sql).toContain("work_order_correction_sessions_one_open_idx");
    expect(sql).toContain("where status = 'open'");
    expect(sql).toContain("unique (shop_id, operation_key)");
  });

  it("derives the lock from immutable invoice history and open correction state", () => {
    const sql = source(migrationPath);
    expect(sql).toContain("work_order_financial_lock_state");
    expect(sql).toContain("iv.lifecycle_status <> 'draft'");
    expect(sql).toContain("and cs.status = 'open'");
    expect(sql).toContain("'locked', exists(select 1 from latest_version)");
  });

  it("guards work orders and anchored child records at the database boundary", () => {
    const sql = source(migrationPath);
    expect(sql).toContain("guard_financially_locked_work_order_child");
    expect(sql).toContain("guard_financially_locked_work_order");
    expect(sql).toContain("WORK_ORDER_FINANCIALLY_LOCKED");
    expect(sql).toContain("before insert or update or delete");
    expect(sql).toContain("'work_order_lines'");
    expect(sql).toContain("'work_order_quote_lines'");
    expect(sql).toContain("'work_order_parts'");
    expect(sql).toContain("'work_order_part_allocations'");
    expect(sql).toContain("'part_request_items'");
  });

  it("permits only canonical financial rollups and the initial invoiced transition", () => {
    const sql = source(migrationPath);
    expect(sql).toContain("'invoice_total'");
    expect(sql).toContain("'payment_status'");
    expect(sql).toContain("'outstanding_balance'");
    expect(sql).toContain("lower(coalesce(new.status::text, '')) = 'invoiced'");
    expect(sql).toContain("lower(coalesce(old.status::text, '')) <> 'invoiced'");
  });

  it("exposes correction lifecycle only through shop-scoped privileged routes", () => {
    const openRoute = source("app/api/work-orders/[id]/corrections/open/route.ts");
    const closeRoute = source(
      "app/api/work-orders/[id]/corrections/[sessionId]/close/route.ts",
    );
    for (const route of [openRoute, closeRoute]) {
      expect(route).toContain("requireShopScopedApiAccess");
      expect(route).toContain('"owner", "admin", "manager"');
      expect(route).toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
    expect(openRoute).toContain("A correction reason is required");
    expect(openRoute).toContain("An idempotency key is required");
    expect(closeRoute).toContain("closeWorkOrderCorrection");
  });
});
