import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260815164500_technician_copilot_job_actions.sql",
  "utf8",
);

describe("Technician CoPilot private job-action bridge", () => {
  it("rechecks the active session and assigned line under locks", () => {
    expect(migration).toContain("pg_advisory_xact_lock(");
    expect(migration).toContain("'copilot:job-action:' || p_operation_id::text");
    expect(migration.indexOf("from public.profiles p")).toBeLessThan(
      migration.indexOf("for update of rs, wol"),
    );
    expect(migration).toContain("for update of rs, wol");
    expect(migration).toContain("from public.work_order_line_technicians wolt");
    expect(migration).toContain("for update;");
    expect(migration).toContain("copilot.technician_is_assigned(");
    expect(migration.indexOf("copilot.technician_is_assigned(")).toBeLessThan(
      migration.indexOf("public.apply_job_punch_transition_atomic("),
    );
  });

  it("delegates writes to the same canonical functions as technician screens", () => {
    expect(migration).toContain("public.apply_job_punch_transition_atomic(");
    expect(migration).toContain("public.apply_offline_line_mutation_atomic(");
    expect(migration).toContain("when 'job.action' then");
    expect(migration).toContain("from public.workforce_operation_keys wok");
    expect(migration).toContain(
      "wok.operation_name is distinct from v_operation_name",
    );
    expect(migration).toContain("v_existing_line_id is distinct from p_work_order_line_id");
  });

  it("keeps the mutation function private from API roles", () => {
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain(
      "to authenticated, service_role",
    );
    expect(migration).toContain(
      "has_function_privilege(\n    'service_role'",
    );
  });
});
