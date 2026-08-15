import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260815211304_technician_copilot_job_completion_replay.sql",
  "utf8",
);

describe("Technician CoPilot private job-completion bridge", () => {
  it("keeps completion inside the assigned active repair session", () => {
    expect(migration).toContain("for update of rs, wol");
    expect(migration).toContain("copilot.technician_is_assigned(");
    expect(migration).toContain("copilot_job_not_active");
    expect(migration).toContain("copilot_job_punch_not_active");
    expect(migration).toContain("from public.work_order_line_labor_segments segment");
    expect(migration).toContain("for update;");
  });

  it("rejects stale completion and delegates atomically to canonical finish", () => {
    expect(migration).toContain("copilot_line_version_conflict");
    expect(migration).toContain("p_action => 'finish'");
    expect(migration).toContain("public.apply_job_punch_transition_atomic(");
    expect(migration).toContain("'job_completed_via_technician_copilot'");
    expect(migration).not.toContain("update public.work_order_lines\n    set status = 'completed'");
  });

  it("binds replay to finish and keeps the bridge private", () => {
    expect(migration.indexOf("if v_action = 'job.complete'")).toBeLessThan(
      migration.indexOf("if not copilot.technician_is_assigned("),
    );
    expect(migration).toContain("else 'job_punch:finish'");
    expect(migration).toContain(
      "wok.operation_name is distinct from v_operation_name",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(migration).not.toContain("to authenticated, service_role");
  });
});
