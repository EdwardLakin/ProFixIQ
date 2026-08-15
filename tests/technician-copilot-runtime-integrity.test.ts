import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814223500_technician_copilot_runtime_integrity.sql",
  "utf8",
);
const assignedWork = readFileSync(
  "features/copilot/technician/server/assignedWork.ts",
  "utf8",
);
const sessionRoute = readFileSync(
  "app/api/copilot/technician/session/route.ts",
  "utf8",
);
const chatRuntime = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const chatRoute = readFileSync(
  "app/api/copilot/technician/chat/route.ts",
  "utf8",
);
const transport = readFileSync(
  "features/copilot/technician/server/transport.ts",
  "utf8",
);
const runtimeIntegration = readFileSync(
  "tests/security/technician-copilot-runtime-integrity.runtime.sql",
  "utf8",
);

describe("Technician CoPilot runtime integrity rescue", () => {
  it("targets the deployed Phase-1 event ledger rather than obsolete columns", () => {
    expect(migration).toContain("repair_session_id");
    expect(migration).toContain(
      "insert into copilot.repair_session_events (\n      repair_session_id,",
    );
    expect(migration).toContain(
      "insert into copilot.repair_session_event_context (\n      event_id,\n      operation_id,",
    );
    expect(migration).not.toContain(
      "insert into copilot.repair_session_events(session_id,shop_id,technician_id",
    );
    expect(migration).not.toContain(
      "insert into copilot.repair_session_event_context(event_id,shop_id,technician_id",
    );
  });

  it("enforces active actionable sessions at the database boundary", () => {
    expect(migration).toContain("copilot_work_order_not_actionable");
    expect(migration).toContain("copilot_session_not_active");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("repair_sessions_guard_anchors");
    expect(migration).toContain(
      "repair_session_documentation_turns_require_active",
    );
  });

  it("filters active canonical assignments before applying candidate limits", () => {
    expect(assignedWork).toContain("ACTIVE_CANONICAL_LINE_STATUSES");
    expect(assignedWork).toContain(
      '.in("status", ACTIVE_TECHNICIAN_LINE_DB_STATUSES)',
    );
    expect(assignedWork).toContain(
      '.in("work_order_lines.status", ACTIVE_TECHNICIAN_LINE_DB_STATUSES)',
    );
    expect(assignedWork).toContain("work_order_lines!inner");
    expect(assignedWork).toContain("MAX_ASSIGNED_LINES_PER_PATH");
    expect(assignedWork).toContain("MAX_WORK_ORDER_CANDIDATES");
  });

  it("hydrates existing sessions through the targeted assigned-work loader", () => {
    expect(sessionRoute).toContain(
      "loadTechnicianWorkCandidateForWorkOrder({",
    );
    expect(sessionRoute).not.toContain("listTechnicianWorkCandidates({");
  });

  it("rejects stale sessions and conflicting turn reuse with a 409", () => {
    expect(chatRuntime).toContain("TechnicianCopilotConflictError");
    expect(chatRuntime).toContain("session.status !== \"active\"");
    expect(chatRuntime).toContain("persistedMessage !== input.requestedMessage");
    expect(chatRuntime).toContain("persistedSource !== input.requestedSource");
    expect(chatRoute).toContain("{ status: conflict.status }");
  });

  it("awaits command-row cleanup on every exit path", () => {
    expect(transport).toContain("} finally {");
    expect(transport).toContain("const cleanup = await admin");
    expect(transport).not.toContain(
      'void admin.from("ai_action_events").delete()',
    );
  });

  it("ships an executable transaction-level lifecycle integration", () => {
    expect(runtimeIntegration).toContain(
      "copilot.technician_session_start_internal(",
    );
    expect(runtimeIntegration).toContain(
      "copilot.technician_event_append_internal(",
    );
    expect(runtimeIntegration).toContain(
      "copilot.technician_session_read_internal(",
    );
    expect(runtimeIntegration).toContain("paused session accepted a repair fact");
    expect(runtimeIntegration).toContain("terminal work order started a session");
    expect(runtimeIntegration.trimEnd()).toMatch(/rollback;$/);
  });
});
