import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const sql = read(
  "supabase/migrations/20260715090050_phase8_atomic_approval_compatibility.sql",
);
const route = read("app/api/quotes/approval-webhook/route.ts");

describe("Phase 8 approval compatibility consistency", () => {
  it("wraps quote and existing-line decisions in one atomic command", () => {
    expect(sql).toContain("apply_approval_compatibility_bundle_atomic");
    expect(sql).toContain("apply_customer_quote_decision_atomic");
    expect(sql).toContain("for update");
    expect(sql).toContain("work_order_is_financially_locked");
    expect(sql).toContain("quote_lifecycle_operation_keys");
  });

  it("authorizes approved lines without claiming active labor", () => {
    expect(sql).toContain("status = 'awaiting'");
    expect(sql).toContain("line_status = 'authorized'");
    expect(sql).not.toContain("status = 'in_progress'");
  });

  it("uses one route RPC and no service-role or obsolete helper", () => {
    expect(route).toContain('rpc(\n    "apply_approval_compatibility_bundle_atomic"');
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).not.toContain("applyAndPropagateWorkOrderLineApprovalDecision");
    expect(route).not.toContain('.from("work_orders")\n      .update');
  });

  it("removes the obsolete multi-write approval helper", () => {
    expect(
      existsSync("features/work-orders/server/workOrderLineApproval.ts"),
    ).toBe(false);
  });
});
