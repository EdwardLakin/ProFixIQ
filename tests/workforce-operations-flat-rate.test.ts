import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

const migration = readFileSync(
  "supabase/migrations/20260724020000_workforce_operations_flat_rate.sql",
  "utf8",
);
const policyHardeningMigration = readFileSync(
  "supabase/migrations/20260724021500_harden_workforce_policy_replay.sql",
  "utf8",
);
const legacyCollectionRoute = readFileSync(
  "app/api/scheduling/sessions/route.ts",
  "utf8",
);
const legacyItemRoute = readFileSync(
  "app/api/scheduling/sessions/[id]/route.ts",
  "utf8",
);

describe("workforce operations security and integrity contract", () => {
  it("separates scheduling, workforce review, and finalization capabilities", () => {
    expect(getActorCapabilities({ role: "manager" })).toMatchObject({
      canApproveTimeAway: true,
      canReviewWorkforceTime: true,
      canFinalizeWorkforceTime: false,
    });
    expect(getActorCapabilities({ role: "foreman" })).toMatchObject({
      canManageScheduling: true,
      canApproveTimeAway: false,
      canReviewWorkforceTime: false,
      canFinalizeWorkforceTime: false,
    });
    expect(getActorCapabilities({ role: "owner" })).toMatchObject({
      canApproveTimeAway: true,
      canReviewWorkforceTime: true,
      canFinalizeWorkforceTime: true,
    });
  });

  it("owns time-away schema and atomic transitions in the migration chain", () => {
    expect(migration).toContain(
      "create table if not exists public.staff_time_off_requests",
    );
    expect(migration).toContain(
      "create or replace function public.submit_staff_time_off_request",
    );
    expect(migration).toContain(
      "create or replace function public.transition_staff_time_off_request",
    );
    expect(migration).toContain(
      "This employee already has an overlapping active request",
    );
    expect(migration).toContain(
      "Managers cannot approve or decline their own request",
    );
  });

  it("uses atomic schedule and pay-period replacement functions", () => {
    expect(migration).toContain(
      "create or replace function public.replace_staff_schedule_template",
    );
    expect(migration).toContain(
      "create or replace function public.replace_payroll_period_snapshot",
    );
  });

  it("makes policy recovery replay-safe and keeps atomic tables RPC-only", () => {
    expect(policyHardeningMigration).toContain(
      "drop policy if exists shop_payroll_settings_manager_select",
    );
    expect(policyHardeningMigration).toContain(
      "drop policy if exists flat_rate_credits_scoped_select",
    );
    expect(policyHardeningMigration).toContain(
      "drop policy if exists labor_segment_corrections_scoped_select",
    );
    expect(policyHardeningMigration).toContain(
      "drop policy if exists staff_schedule_templates_shop_write",
    );
    expect(policyHardeningMigration).toContain(
      "drop policy if exists staff_time_off_requests_manager_update",
    );
    expect(policyHardeningMigration).toContain(
      "drop policy if exists staff_availability_blocks_shop_write",
    );
  });

  it("restricts the internal flat-rate sync helper to service role", () => {
    expect(policyHardeningMigration).toContain(
      "revoke all on function public.sync_work_order_line_flat_rate_credits(uuid)\n  from public",
    );
    expect(policyHardeningMigration).toContain(
      "revoke all on function public.sync_work_order_line_flat_rate_credits(uuid)\n  from authenticated",
    );
    expect(policyHardeningMigration).toContain(
      "grant execute on function public.sync_work_order_line_flat_rate_credits(uuid)\n  to service_role",
    );
  });

  it("creates durable, balanced flat-rate credits with locked-period checks", () => {
    expect(migration).toContain(
      "create table if not exists public.work_order_line_flat_rate_credits",
    );
    expect(migration).toContain(
      "create or replace function public.replace_work_order_line_flat_rate_credits",
    );
    expect(migration).toContain(
      "Flat-rate credits must total the line labor hours",
    );
    expect(migration).toContain("The matching pay period is locked");
    expect(migration).toContain(
      "work_order_line_labor_segments_sync_flat_rate_credits",
    );
    expect(migration).toContain(
      "coalesce(new.work_order_line_id, old.work_order_line_id)",
    );
  });

  it("preserves audited canonical labor corrections without hard deletion", () => {
    expect(migration).toContain(
      "create table if not exists public.work_order_line_labor_segment_corrections",
    );
    expect(migration).toContain(
      "create or replace function public.correct_work_order_line_labor_segment",
    );
    expect(migration).toContain(
      "Corrected job time overlaps another labor segment",
    );
    expect(migration).not.toContain(
      "delete from public.work_order_line_labor_segments",
    );
  });

  it("makes the legacy session write APIs explicitly read-only", () => {
    expect(legacyCollectionRoute).toContain("{ status: 410 }");
    expect(legacyItemRoute.match(/{ status: 410 }/g)).toHaveLength(2);
    expect(legacyCollectionRoute).not.toContain(
      '.from("tech_sessions").insert',
    );
    expect(legacyItemRoute).not.toContain('.from("tech_sessions").update');
    expect(legacyItemRoute).not.toContain('.from("tech_sessions").delete');
  });
});
