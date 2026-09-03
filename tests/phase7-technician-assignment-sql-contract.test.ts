import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260822235000_establish_technician_assignment_contract.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const triggerRetirementMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260903140907_retire_legacy_assignment_mirror_triggers.sql",
  ),
  "utf8",
);
const runtime = fs.readFileSync(
  path.join(
    process.cwd(),
    "tests/security/technician-assignment-contract.runtime.sql",
  ),
  "utf8",
);
const cleanReplayWorkflow = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/supabase-clean-replay-audit.yml"),
  "utf8",
);
const copilotRuntime = fs.readFileSync(
  path.join(
    process.cwd(),
    "tests/security/technician-copilot-runtime-integrity.runtime.sql",
  ),
  "utf8",
);

describe("PFX-004 atomic assignment SQL contract", () => {
  it("declares one canonical set, primary mirror, and report-only legacy drift", () => {
    expect(migration).toContain(
      "work_order_line_technicians is the canonical multi-technician set",
    );
    expect(migration).toContain(
      "work_order_lines.assigned_tech_id is the explicit primary/operational owner",
    );
    expect(migration).toContain(
      "create or replace function public.report_work_order_line_assignment_ambiguities",
    );
    expect(migration).toContain("legacy_primary_conflict");
    expect(migration).toContain("No row in this report is automatically backfilled");
    const ambiguityReport = migration.slice(
      migration.indexOf(
        "create or replace function public.report_work_order_line_assignment_ambiguities",
      ),
      migration.indexOf(
        "comment on function public.report_work_order_line_assignment_ambiguities",
      ),
    );
    expect(ambiguityReport).not.toContain("update public.work_order_lines");
  });

  it("supports explicit assign, supporting, reassign, remove, and clear actions", () => {
    expect(migration).toContain(
      "v_action not in ('set_primary', 'add_supporting', 'remove_supporting', 'clear')",
    );
    expect(migration).toContain("set assigned_tech_id = p_technician_id");
    expect(migration).toContain("set assigned_tech_id = null");
    expect(migration).toContain(
      "Change or clear the primary technician instead of removing it as supporting.",
    );
    expect(migration).toContain("assignment_mode', 'explicit_primary_with_supporting_technicians'");
  });

  it("serializes edits, rejects stale sessions/inactive techs, and preserves active labor", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("ASSIGNMENT_STALE");
    expect(migration).toContain(
      "set updated_at = coalesce(updated_at, created_at, clock_timestamp())",
    );
    expect(migration).toContain("alter column updated_at set default now()");
    expect(migration).toContain("alter column updated_at set not null");
    expect(migration).toContain("v_next_updated_at := greatest(");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toContain("interval '1 microsecond'");
    const assignmentMutation = migration.slice(
      migration.indexOf(
        "create or replace function public.mutate_work_order_line_assignment_atomic",
      ),
      migration.indexOf(
        "create or replace function public.assign_work_order_line_technician_atomic",
      ),
    );
    expect(assignmentMutation).not.toContain("updated_at = now()");
    expect(migration).toContain(
      "coalesce(v_employment_status, '') <> 'active'",
    );
    expect(migration).toContain("ACTIVE_LABOR");
    expect(migration).toContain("work_order_is_financially_locked");
    expect(migration).toContain(
      "segment.technician_id = assignment.technician_id",
    );
  });

  it("makes bulk assignment transactional and never swallows bridge failures", () => {
    expect(migration).toContain(
      "create or replace function public.assign_work_order_primary_technician_bulk_atomic",
    );
    expect(migration).toContain(
      "perform public.mutate_work_order_line_assignment_atomic",
    );
    expect(migration).not.toContain("failed to upsert work_order_line_technicians");
    expect(migration).toContain("wol.assigned_to is null");
    expect(migration).toContain(
      "create or replace function public.shop_assistant_assign_work_order_atomic",
    );
    expect(migration).toContain(
      "v_assignment_result := public.assign_work_order_primary_technician_bulk_atomic",
    );
  });

  it("defers a database invariant until the full assignment transaction commits", () => {
    expect(migration).toContain(
      "create or replace function private.enforce_work_order_line_assignment_contract",
    );
    expect(migration).toContain(
      "create constraint trigger enforce_work_order_line_assignment_contract",
    );
    expect(migration).toContain(
      "create constraint trigger enforce_work_order_line_technician_assignment_contract",
    );
    expect(migration).toContain("deferrable initially deferred");
    expect(migration).toContain(
      "primary technician in the canonical set",
    );
    expect(migration).toContain(
      "create or replace function public.mobile_materialize_service_visit_work_order_atomic",
    );
    expect(migration).toContain(
      "private.mobile_materialize_visit_work_order_mode_core",
    );
    expect(migration).toContain("set assigned_to = null");
    expect(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "tests/mobile/mobile-v1-post-merge-hardening.runtime.sql",
        ),
        "utf8",
      ),
    ).toContain("v_line.assigned_to is not null");
  });

  it("retires only the legacy triggers that repopulated assigned_to", () => {
    expect(triggerRetirementMigration).toContain(
      "drop trigger if exists trg_sync_work_order_line_assignee",
    );
    expect(triggerRetirementMigration).toContain(
      "drop trigger if exists trg_wol_sync_assigned_to",
    );
    expect(triggerRetirementMigration).not.toContain("drop function");
    expect(runtime).toContain("runtime:replace-legacy-primary");
    expect(runtime).toContain(
      "A retired legacy assignment mirror trigger is still active.",
    );
  });

  it("does not create labor, payroll, or notification side effects", () => {
    const mutation = migration.slice(
      migration.indexOf(
        "create or replace function public.mutate_work_order_line_assignment_atomic",
      ),
      migration.indexOf(
        "create or replace function public.assign_work_order_line_technician_atomic",
      ),
    );
    expect(mutation).not.toMatch(/insert into public\.work_order_line_labor_segments/i);
    expect(mutation).not.toMatch(/insert into public\.payroll/i);
    expect(mutation).not.toMatch(/insert into public\.[a-z_]*notifications/i);
  });

  it("keeps the existing Technician Copilot runtime on the canonical assignment set", () => {
    expect(copilotRuntime).toContain(
      "insert into public.work_order_line_technicians",
    );
    expect(copilotRuntime).toContain("set constraints all deferred");
    expect(copilotRuntime).not.toContain(
      "assigned_to = 'a1438000-0000-4000-8000-000000000004'",
    );
  });

  it("preserves the authenticated legacy wrapper without permitting actor spoofing", () => {
    expect(migration).toContain(
      "Authenticated actor does not match assigning user.",
    );
    expect(migration).toContain(
      "Work-order assignment authority is required.",
    );
    expect(migration).toContain("to authenticated, service_role;");
  });

  it("authorizes assignment summaries from canonical same-shop identity data", () => {
    expect(migration).not.toContain("public.can_view_work_order");
    expect(migration).not.toMatch(/current_user in \([^)]*postgres/i);
    expect(migration).toContain("coalesce(auth.role(), '') = 'service_role'");
    expect(migration).toContain("actor.shop_id = wol.shop_id");
    expect(migration).toContain("actor.user_id = (select auth.uid())");
    expect(migration).toContain(
      "private.workspace_is_shop_staff_role(actor.role::text)",
    );
  });

  it("executes the contract against a clean replay database", () => {
    expect(runtime).toContain("runtime:set-primary");
    expect(runtime).toContain("runtime:reassign");
    expect(runtime).toContain("runtime:clear");
    expect(runtime).toContain("ASSIGNMENT_STALE");
    expect(runtime).toContain("An inactive technician was assigned.");
    expect(runtime).toContain("Assignment created a labor segment.");
    expect(cleanReplayWorkflow).toContain(
      "tests/security/technician-assignment-contract.runtime.sql",
    );
  });
});
