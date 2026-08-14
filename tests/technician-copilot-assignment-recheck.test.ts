import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeSql = readFileSync(
  "supabase/migrations/20260813223510_technician_copilot_private_runtime.sql",
  "utf8",
);

function functionSection(start: string, next?: string): string {
  const startIndex = runtimeSql.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing SQL function marker: ${start}`);
  const endIndex = next ? runtimeSql.indexOf(next, startIndex + start.length) : -1;
  return runtimeSql.slice(startIndex, endIndex >= 0 ? endIndex : undefined);
}

describe("Technician CoPilot assignment recheck", () => {
  it("rechecks canonical assignment whenever an existing session is read", () => {
    const section = functionSection(
      "create or replace function copilot.technician_session_read_internal",
      "create or replace function copilot.technician_session_start_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("copilot_work_order_assignment_required");
  });

  it("rechecks canonical assignment before a session can start or resume", () => {
    const section = functionSection(
      "create or replace function copilot.technician_session_start_internal",
      "create or replace function copilot.technician_event_append_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("p_work_order_line_id");
    expect(section).toContain("copilot_work_order_assignment_required");
  });

  it("rechecks canonical assignment before any event can be appended to an existing session", () => {
    const section = functionSection(
      "create or replace function copilot.technician_event_append_internal",
    );
    expect(section).toContain("copilot.technician_is_assigned(");
    expect(section).toContain("v_work_order_id");
    expect(section).toContain("copilot_work_order_assignment_required");
    expect(section).toContain("rs.status<>'closed'");
  });
});
