import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260820205700_parts_pick_request_signal.sql";
const migration = readFileSync(migrationPath, "utf8");
const hardeningMigrationPath =
  "supabase/migrations/20260820223500_parts_pick_request_trusted_delivery.sql";
const hardeningMigration = readFileSync(hardeningMigrationPath, "utf8");
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
    expect(existsSync(hardeningMigrationPath)).toBe(true);
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
    expect(hardeningMigration).toContain(
      "without rewriting the preview-applied 20260820205700 migration",
    );
  });

  it("keeps approval as the commercial release boundary", () => {
    expect(migration).toContain("parts_request_is_operationally_released");
    expect(migration).toContain("parts_not_approved");
    expect(migration).not.toContain("approval_state = 'approved'");
  });

  it("raises the same pick signal only for a live technician start/resume", () => {
    expect(hardeningMigration).toContain(
      "private.parts_request_pick_for_line_internal",
    );
    expect(hardeningMigration).toContain("trg_parts_request_pick_on_job_start");
    expect(hardeningMigration).toContain("new.ended_at is not null");
    expect(hardeningMigration).toContain("'legacy_line_backfill'");
    expect(hardeningMigration).toContain("'job_start'");
    expect(hardeningMigration).toContain(":request-pick:job-start:");
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
    expect(notificationReader).not.toContain('"lead_hand"');
    expect(notificationReader).not.toContain('"foreman"');
  });

  it("keeps delivery durable when the optional Agent notification table is absent", () => {
    expect(migration).toContain(
      "to_regclass('public.assistant_notifications') is null",
    );
    expect(notificationReader).toContain("getDurablePartsPickNotifications");
    expect(notificationReader).toContain('.from("part_requests")');
    expect(notificationReader).toContain('.from("part_request_items")');
    expect(notificationReader).toContain(
      '.not("pick_requested_at", "is", null)',
    );
    expect(notificationReader).toContain(
      "isMissingAssistantNotificationsError",
    );
    expect(notificationReader).toContain("durableSignal: true");
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

  it("moves audit-source selection behind trusted entry points", () => {
    expect(hardeningMigration).toMatch(
      /alter function public\.parts_request_pick_for_line_atomic\(\s*uuid, uuid, text, text\s*\) set schema private/,
    );
    expect(hardeningMigration).toContain(
      "rename to parts_request_pick_for_line_internal",
    );
    expect(hardeningMigration).toContain(
      "create or replace function public.parts_request_pick_for_line_atomic",
    );
    expect(hardeningMigration).toContain("auth.uid(),\n    'manual'");
    expect(hardeningMigration).toContain(
      "private.parts_request_pick_for_line_internal(\n    new.work_order_line_id",
    );
    expect(route).toContain("parts_request_pick_for_line_atomic");
    expect(route).not.toContain("p_source");
    expect(route).not.toContain("p_actor_user_id");
  });

  it("reactivates previously requested alerts when quantity becomes actionable again", () => {
    expect(hardeningMigration).toContain("if v_has_actionable then");
    expect(hardeningMigration).toContain("pick_requested_at = now()");
    expect(hardeningMigration).toContain(
      "perform public.parts_upsert_pick_request_notification",
    );
    expect(hardeningMigration).toContain("coalesce(item.qty_returned, 0)");
    expect(hardeningMigration).toContain("coalesce(item.qty_approved, 0)");
    expect(hardeningMigration).toContain("return;");
  });

  it("resolves alerts when requests or remaining items are no longer actionable", () => {
    expect(hardeningMigration).toContain(
      "parts_reconcile_pick_request_notification",
    );
    expect(hardeningMigration).toContain("'fulfilled'");
    expect(hardeningMigration).toContain("'rejected'");
    expect(hardeningMigration).toContain("'cancelled'");
    expect(hardeningMigration).toContain("'canceled'");
    expect(hardeningMigration).toContain("'deferred'");
    expect(migration).toContain(
      "after update of status on public.part_requests",
    );
    expect(hardeningMigration).toContain("status = 'resolved'");
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
    expect(hardeningMigration).toContain(
      "revoke all on function private.parts_request_pick_for_line_internal",
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
