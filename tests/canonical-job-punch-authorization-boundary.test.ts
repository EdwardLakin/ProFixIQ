import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260831035025_harden_canonical_job_punch_authorization.sql",
  "utf8",
);
const privilegeRuntime = readFileSync(
  "tests/security/p0-002-rpc-privileges.runtime.sql",
  "utf8",
);

describe("canonical job-punch authorization boundary", () => {
  it("moves the old implementation behind a non-authenticated core", () => {
    expect(migration).toContain("set schema private");
    expect(migration).toContain("rename to apply_job_punch_transition_atomic_core");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain(
      "create function public.apply_job_punch_transition_atomic(",
    );
  });

  it("guards labor actions while preserving Hold and Remove Hold", () => {
    expect(migration).toContain("v_action = 'finish'");
    expect(migration).toContain(
      "v_action in ('start', 'resume')",
    );
    expect(migration).toContain("p_release_to_awaiting is not true");
    expect(migration).toContain("Technician is not assigned to this work-order line.");
    expect(migration).toContain("PARTS_QUOTE_HOLD_PENDING");
    expect(migration).toContain("LINE_APPROVAL_PENDING");
    expect(migration).toContain(
      "Hold and Remove Hold are the established shared controls",
    );
    expect(migration).not.toContain("v_action = 'pause' and v_protected_labor_action");
  });

  it("pins privileged resolution and locks authorization evidence", () => {
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("or v_role is null");
    expect(migration).toContain("from public.work_orders work_order");
    expect(migration).toContain("from public.work_order_line_technicians assignment");
    expect(migration).toContain("from public.work_order_line_labor_segments segment");
  });

  it("preserves the public signature and authenticated grant", () => {
    expect(migration).toContain(
      "to authenticated, service_role",
    );
    expect(migration).toContain("p_release_to_awaiting boolean default false");
    expect(migration).toContain("p_details jsonb default '{}'::jsonb");
    expect(privilegeRuntime).toContain("canonical job-punch RPC ACL is wrong");
    expect(privilegeRuntime).toContain("private job-punch core is exposed");
  });
});
