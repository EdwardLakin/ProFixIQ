import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260820205700_parts_pick_request_signal.sql";
const migration = readFileSync(migrationPath, "utf8");
const previewHistoryMigrations = [
  "supabase/migrations/20260820151500_parts_pick_request_signal.sql",
  "supabase/migrations/20260820174500_parts_pick_request_signal_review_hardening.sql",
  "supabase/migrations/20260820175500_parts_pick_request_signal_review_followup.sql",
];
const route = readFileSync(
  "app/api/work-orders/lines/[id]/request-pick/route.ts",
  "utf8",
);
const punchButton = readFileSync(
  "features/work-orders/components/JobPunchButton.tsx",
  "utf8",
);
const notificationReader = readFileSync(
  "features/agent/server/syncAssistantNotifications.ts",
  "utf8",
);

describe("parts pick request signal", () => {
  it("ships one canonical migration while preserving preview history versions", () => {
    expect(existsSync(migrationPath)).toBe(true);
    for (const path of previewHistoryMigrations) {
      expect(existsSync(path)).toBe(true);
      const tombstone = readFileSync(path, "utf8");
      expect(tombstone).toContain("Migration-history tombstone");
      expect(tombstone).toContain("20260820205700");
      expect(tombstone).not.toContain("create or replace function");
      expect(tombstone).not.toContain("alter table");
    }
    expect(migration).toContain("add column if not exists pick_requested_at");
    expect(migration).toContain(
      "drop function if exists public.parts_request_pick_for_line_atomic(uuid, uuid, text)",
    );
  });

  it("keeps approval as the commercial release boundary", () => {
    expect(migration).toContain("parts_request_is_operationally_released");
    expect(migration).toContain("parts_not_approved");
    expect(migration).not.toContain("approval_state = 'approved'");
  });

  it("raises the same pick signal only for a live technician start/resume", () => {
    expect(migration).toContain(
      "function public.parts_request_pick_for_line_atomic",
    );
    expect(migration).toContain("trg_parts_request_pick_on_job_start");
    expect(migration).toContain("new.ended_at is not null");
    expect(migration).toContain("'legacy_line_backfill'");
    expect(migration).toContain("'job_start'");
    expect(migration).toContain(":request-pick:job-start:");
  });

  it("computes remaining quantity per request item", () => {
    expect(migration).toContain("coalesce(item.qty_reserved, 0)");
    expect(migration).toContain("coalesce(item.qty_consumed, 0)");
    expect(migration).toContain("coalesce(item.qty_returned, 0)");
    expect(migration).toContain("coalesce(sum(greatest(");
    expect(migration).toContain(
      "v_staged := greatest(v_required - v_remaining, 0)",
    );
    expect(migration).toContain("'already_staged'");
  });

  it("processes every active request attached to the repair line", () => {
    expect(migration).toContain("for v_request in");
    const requestLoop = migration.slice(
      migration.indexOf("for v_request in"),
      migration.indexOf("if v_active_count = 0"),
    );
    expect(requestLoop).not.toContain("limit 1");
    expect(migration).toContain(
      "v_requested_count := v_requested_count + 1",
    );
    expect(migration).toContain("'requestIds', v_request_ids");
  });

  it("uses one shop-scoped notification through an isolated visible source", () => {
    expect(migration).toContain("'parts_pick_workflow'");
    expect(migration).toContain("'parts_pick_requested'");
    expect(migration).toContain(
      "v_fingerprint := 'parts-pick-request::' || p_request_id::text;",
    );
    expect(migration).toContain("$1, null, 'parts', 'parts_pick_workflow'");
    expect(migration).not.toContain("for v_recipient in");
    expect(notificationReader).toContain("canSeePartsPickWorkflow");
    expect(notificationReader).toContain('"parts_pick_workflow"');
    expect(notificationReader).toContain('"lead_hand"');
    expect(notificationReader).toContain('"foreman"');
  });

  it("keeps the optional Agent notification table out of clean-replay failures", () => {
    expect(migration).toContain(
      "to_regclass('public.assistant_notifications') is null",
    );
    expect(migration).toContain("execute $sql$");
  });

  it("makes the pick mutation durable and state-independent on replay", () => {
    expect(migration).toContain("public.parts_begin_operation");
    expect(migration).toContain("'request_parts_pick'");
    expect(migration).toContain("'work_order_line'");
    expect(migration).toContain("public.parts_complete_operation");
    expect(migration.indexOf("public.parts_begin_operation")).toBeLessThan(
      migration.indexOf("for v_request in"),
    );
    expect(route).toContain("p_operation_key:");
    expect(route).toContain(":request-pick:");
  });

  it("restricts mechanic requests to assigned non-terminal repair lines", () => {
    expect(migration).toContain("v_role = 'mechanic'");
    expect(migration).toContain("public.work_order_line_technicians");
    expect(migration).toContain(
      "assignment.technician_id = v_profile_id",
    );
    expect(migration).toContain("v_line.assigned_tech_id");
    expect(migration).toContain("'ready_to_invoice'");
    expect(migration).toContain("'invoiced'");
    expect(migration).toContain("'voided'");
  });

  it("stores pick_requested_by in the profile identity domain", () => {
    expect(migration).toContain("v_actor_profile_id := v_profile_id");
    expect(migration).toContain("profile.user_id = p_actor_user_id");
    expect(migration).toContain("pick_requested_by = v_actor_profile_id");
  });

  it("does not route technicians through the Parts-only materialization RPC", () => {
    expect(route).not.toContain("parts_request_work_order_line_atomic");
    expect(route).toContain("parts_request_pick_for_line_atomic");
    expect(route).toContain('p_source: "manual"');
  });

  it("resolves alerts when requests or remaining items are no longer actionable", () => {
    expect(migration).toContain(
      "parts_reconcile_pick_request_notification",
    );
    expect(migration).toContain("'fulfilled'");
    expect(migration).toContain("'rejected'");
    expect(migration).toContain("'cancelled'");
    expect(migration).toContain("'canceled'");
    expect(migration).toContain("'deferred'");
    expect(migration).toContain(
      "after update of status on public.part_requests",
    );
    expect(migration).toContain("status = 'resolved'");
  });

  it("does not write a nonexistent part_requests.updated_at column", () => {
    const updateBlock = migration.slice(
      migration.indexOf("update public.part_requests request"),
      migration.indexOf("perform public.parts_upsert_pick_request_notification"),
    );
    expect(updateBlock).not.toContain("updated_at");
  });

  it("converges preview-only notification rows through the final migration", () => {
    expect(migration).toContain(
      "notification.source in ('parts_workflow', 'parts_pick_workflow')",
    );
    expect(migration).toContain("set source = 'parts_pick_workflow'");
    expect(migration).toContain("fingerprint like 'parts-pick-request::%::%'");
  });

  it("keeps internal reconciliation helpers unavailable to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function public.parts_reconcile_pick_request_notification(uuid)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain(
      "grant execute on function public.parts_reconcile_pick_request_notification(uuid)",
    );
  });

  it("surfaces Request pick alongside the canonical punch control even on hold", () => {
    expect(punchButton).toContain("Request pick");
    expect(punchButton).toContain("/request-pick");
    expect(punchButton).toContain(
      "you can still request Parts to pick/stage it",
    );
    expect(punchButton).not.toContain("disabled={pickBusy || effectiveDisabled");
  });
});
