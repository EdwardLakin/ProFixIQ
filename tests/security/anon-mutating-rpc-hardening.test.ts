import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20260818190557_harden_anon_mutating_rpc_acl.sql",
);
const punchCorrectionRoute = source(
  "app/api/workforce/attendance/corrections/route.ts",
);
const lineDispositionRoute = source(
  "app/api/work-orders/lines/[id]/delete-or-void/route.ts",
);

describe("anonymous mutating RPC hardening", () => {
  it("keeps impersonation-prone commands behind capability-gated admin routes", () => {
    expect(punchCorrectionRoute).toContain(
      'requiredCapability: "canManageScheduling"',
    );
    expect(punchCorrectionRoute).toContain(
      "const admin = createAdminSupabase()",
    );
    expect(punchCorrectionRoute).toContain(
      'admin.rpc("apply_punch_correction"',
    );

    expect(lineDispositionRoute).toContain(
      'requiredCapability: "canManageWorkOrders"',
    );
    expect(lineDispositionRoute).toContain("createAdminSupabase()");
    expect(lineDispositionRoute).toContain(
      'rpc.rpc("parts_void_work_order_line_atomic"',
    );
    expect(lineDispositionRoute).not.toContain("const rpc = access.supabase");
  });

  it("keeps baseline-owned RPC assertions strict", () => {
    for (const functionName of [
      "open_work_order_correction_session",
      "close_work_order_correction_session",
      "apply_punch_correction",
      "parts_void_work_order_line_atomic",
      "replace_staff_schedule_template",
      "transition_staff_time_off_request",
    ]) {
      expect(migration).toContain(`function public.${functionName}`);
    }
    expect(migration).toContain(
      "RPC hardening failed: punch correction ACL is unsafe",
    );
    expect(migration).toContain(
      "RPC hardening failed: line void ACL is unsafe",
    );
  });

  it("hardens production-only legacy RPCs only when they exist", () => {
    expect(migration).toContain("p.proname = 'agent_claim_next_job'");
    expect(migration).toContain("p.proname = 'work_orders_set_intake'");
    expect(migration).toContain(
      "pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, jsonb, boolean'",
    );
    expect(migration).not.toContain(
      "revoke execute on function public.work_orders_set_intake",
    );
    expect(migration).not.toContain(
      "create or replace function public.work_orders_set_intake",
    );
  });

  it("is a forward-only ACL migration", () => {
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit;\s*$/);
    expect(migration).not.toMatch(
      /\b(?:drop|alter|create)\s+(?:table|column|type|function)\b/i,
    );
  });
});
