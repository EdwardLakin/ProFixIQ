import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSql = readFileSync(
  "supabase/migrations/20260813223510_technician_copilot_private_runtime.sql",
  "utf8",
);
const documentationSql = readFileSync(
  "supabase/migrations/20260814030000_technician_copilot_atomic_documentation_turns.sql",
  "utf8",
);

function functionSection(
  sql: string,
  start: string,
  next?: string,
): string {
  const startIndex = sql.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing SQL function marker: ${start}`);
  const endIndex = next ? sql.indexOf(next, startIndex + start.length) : -1;
  return sql.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

describe("Technician CoPilot assignment recheck", () => {
  it("rechecks canonical assignment in the effective current session-read implementation", () => {
    // Phase 3 replaces the Phase-2 read helper to include documentation-turn
    // receipts, so this assertion intentionally targets the latest definition.
    const section = functionSection(
      documentationSql,
      "create or replace function copilot.technician_session_read_internal",
      "create or replace function copilot.technician_documentation_append_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("copilot_work_order_assignment_required");
  });

  it("rechecks canonical assignment before a session can start or resume", () => {
    const section = functionSection(
      runtimeSql,
      "create or replace function copilot.technician_session_start_internal",
      "create or replace function copilot.technician_event_append_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("p_work_order_line_id");
    expect(section).toContain("copilot_work_order_assignment_required");
  });

  it("rechecks canonical assignment before any regular event can be appended", () => {
    const section = functionSection(
      runtimeSql,
      "create or replace function copilot.technician_event_append_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("v_work_order_id");
    expect(section).toContain("copilot_work_order_assignment_required");
    expect(section).toContain("rs.status<>'closed'");
  });

  it("rechecks canonical assignment before silent documentation can append repair facts", () => {
    const section = functionSection(
      documentationSql,
      "create or replace function copilot.technician_documentation_append_internal",
      "comment on table copilot.repair_session_documentation_turns",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("v_work_order_id");
    expect(section).toContain("copilot_work_order_assignment_required");
    expect(section).toContain("rs.status <> 'closed'");
  });
});
