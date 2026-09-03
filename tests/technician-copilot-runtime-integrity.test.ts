import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814223500_technician_copilot_runtime_integrity.sql",
  "utf8",
);
const cleanupMigration = readFileSync(
  "supabase/migrations/20260815024500_technician_copilot_command_envelope_cleanup.sql",
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
const cleanReplayWorkflow = readFileSync(
  ".github/workflows/supabase-clean-replay-audit.yml",
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

  it("keeps command envelopes ephemeral without widening service-role DELETE", () => {
    expect(transport).not.toContain('.from("ai_action_events")\n        .delete()');
    expect(cleanupMigration).toContain(
      "create or replace function copilot.cleanup_ai_action_command_after_insert()",
    );
    expect(cleanupMigration).toContain(
      "create trigger technician_copilot_ai_action_command_cleanup\nafter insert on public.ai_action_events",
    );
    expect(cleanupMigration).toContain(
      "where id = new.id\n    and source = 'technician_copilot_command'",
    );
    expect(cleanupMigration).toContain(
      "has_table_privilege('service_role', 'public.ai_action_events', 'DELETE')",
    );
    expect(runtimeIntegration).toContain(
      "command envelope persisted after RETURNING",
    );
  });

  it("runs the lifecycle integration from the existing required clean-replay gate", () => {
    expect(cleanReplayWorkflow).toContain(
      "-f tests/security/technician-copilot-runtime-integrity.runtime.sql",
    );
    expect(
      existsSync(".github/workflows/technician-copilot-runtime-integrity.yml"),
    ).toBe(false);
  });

  it("ships an executable transaction-level lifecycle integration", () => {
    expect(runtimeIntegration).toContain(
      "billing_entitlement_override",
    );
    expect(runtimeIntegration).toContain("'internal_demo'");
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
