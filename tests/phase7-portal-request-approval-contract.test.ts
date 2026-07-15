import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const requestSql = read(
  "supabase/migrations/20260715080200_phase7_atomic_portal_request_lines.sql",
);
const approvalSql = read(
  "supabase/migrations/20260715080300_phase7_atomic_portal_line_decisions.sql",
);
const requestStart = read("app/api/portal/request/start/route.ts");
const customRoute = read("app/api/portal/request/add-custom-line/route.ts");
const menuRoute = read("app/api/portal/request/add-menu-line/route.ts");
const inspectionRoute = read(
  "app/api/portal/request/add-inspection-line/route.ts",
);
const approvalRoute = read(
  "app/api/work-orders/lines/[id]/approval-decision/route.ts",
);

describe("Phase 7 portal requests and approvals", () => {
  it("requires stable request-start identity and verifies vehicle ownership", () => {
    expect(requestStart).toContain('headers.get("Idempotency-Key")');
    expect(requestStart).toContain("A stable Idempotency-Key is required.");
    expect(requestStart).toContain('.eq("customer_id", customer.id)');
    expect(requestStart).toContain('.eq("shop_id", customer.shop_id)');
  });

  it("routes all request line kinds through one atomic command", () => {
    expect(requestSql).toContain("add_portal_request_line_atomic");
    expect(requestSql).toContain("work_order_is_financially_locked");
    expect(requestSql).toContain("portal_lifecycle_operation_keys");
    expect(requestSql).toContain("for update");

    for (const route of [customRoute, menuRoute, inspectionRoute]) {
      expect(route).toContain("addPortalRequestLine");
      expect(route).toContain("Idempotency-Key");
      expect(route).not.toContain('.from("work_order_lines")');
    }
  });

  it("applies customer line decisions atomically without starting labor", () => {
    expect(approvalSql).toContain("apply_portal_line_decision_atomic");
    expect(approvalSql).toContain("status = 'awaiting'");
    expect(approvalSql).toContain("line_status = 'authorized'");
    expect(approvalSql).toContain("work_order_is_financially_locked");
    expect(approvalSql).toContain("Portal customer actor mismatch");
    expect(approvalRoute).toContain('rpc("apply_portal_line_decision_atomic"');
    expect(approvalRoute).not.toContain(
      "applyAndPropagateWorkOrderLineApprovalDecision",
    );
  });
});
