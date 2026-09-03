import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260903181511_enforce_work_order_command_product_boundary.sql";
const migration = readFileSync(migrationPath, "utf8");
const offlineRoute = readFileSync("app/api/offline/mutations/route.ts", "utf8");

describe("Work Order command product RPC boundary", () => {
  it("keeps the public signature while hiding the prior implementation", () => {
    expect(migration).toContain(
      "alter function public.apply_job_punch_transition_atomic(",
    );
    expect(migration).toContain("set schema private");
    expect(migration).toContain(
      "rename to apply_job_punch_transition_product_core",
    );
    expect(migration).toContain(
      "revoke all on function private.apply_job_punch_transition_product_core(",
    );
    expect(migration).toContain(
      "create function public.apply_job_punch_transition_atomic(",
    );
  });

  it("replays committed receipts before current product authorization", () => {
    const replay = migration.indexOf(
      "A committed operation is immutable history",
    );
    const serviceRole = migration.indexOf(
      "coalesce(auth.role(), '') = 'service_role'",
    );
    const productCheck = migration.indexOf(
      "public.profixiq_shop_has_product_access(",
    );
    const fieldCheck = migration.indexOf(
      "public.mobile_profile_has_field_service_access(",
    );

    expect(replay).toBeGreaterThan(-1);
    expect(replay).toBeLessThan(serviceRole);
    expect(serviceRole).toBeLessThan(productCheck);
    expect(productCheck).toBeLessThan(fieldCheck);
    expect(migration).toContain(
      "A peer request may have committed while this attempt waited",
    );
    expect(migration).toContain(
      "The contending request may have committed its receipt",
    );
  });

  it("locks a current linked Field visit with technician ownership", () => {
    expect(migration).toContain("from public.service_visits visit");
    expect(migration).toContain("visit.work_order_id = v_line.work_order_id");
    expect(migration).toContain("visit.mode = 'mobile'");
    expect(migration).toContain("'arrived', 'working', 'paused'");
    expect(migration).not.toMatch(
      /visit\.status\s+in\s*\([^)]*'completed'[^)]*\)/,
    );
    expect(migration).not.toMatch(
      /visit\.status\s+in\s*\([^)]*'cancelled'[^)]*\)/,
    );
    expect(migration).toContain("visit.assigned_user_id = v_profile_id");
    expect(migration).toContain("for update nowait");
  });

  it("leaves action-specific Shop roles to the established punch core", () => {
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor', 'service', 'parts'",
    );
    expect(migration).toContain(
      "'owner', 'admin', 'manager', 'advisor',\n          'mechanic', 'lead_hand', 'foreman'",
    );
  });

  it("preserves trusted service-role callers and the established mutation", () => {
    const serviceRole = migration.indexOf(
      "coalesce(auth.role(), '') = 'service_role'",
    );
    const profileRead = migration.indexOf("select profile.id,");

    expect(serviceRole).toBeGreaterThan(-1);
    expect(serviceRole).toBeLessThan(profileRead);
    expect(
      migration.match(/private\.apply_job_punch_transition_product_core\(/g),
    ).toHaveLength(6);
  });

  it("guards the specialized parts-quote Hold with the shared product fence", () => {
    expect(migration).toContain(
      "rename to apply_pre_labor_parts_quote_hold_product_core",
    );
    expect(migration).toContain(
      "create function public.apply_pre_labor_parts_quote_hold_atomic(",
    );
    expect(migration).toContain(
      "operation.operation_name = 'pre_labor_parts_quote_hold'",
    );
    expect(migration).toContain(
      "return private.apply_pre_labor_parts_quote_hold_product_core(",
    );
  });

  it("guards CoPilot without trusting its service-role bridge", () => {
    expect(migration).toContain(
      "rename to apply_technician_copilot_job_punch_transition_product_core",
    );
    expect(migration).toContain(
      "create function private.apply_technician_copilot_job_punch_transition_atomic(",
    );
    expect(migration).toContain(
      "return private.apply_technician_copilot_job_punch_transition_product_core(",
    );
  });

  it("routes CoPilot story saves through the same product fence", () => {
    expect(migration).toContain(
      "create function private.apply_technician_copilot_story_mutation_atomic(",
    );
    expect(migration).toContain(
      "from public.offline_mutation_receipts receipt",
    );
    expect(migration).toContain(
      "v_public_call constant text := 'public.apply_offline_line_mutation_atomic('",
    );
    expect(migration).toContain(
      "v_private_call constant text := 'private.apply_technician_copilot_story_mutation_atomic('",
    );
  });

  it("fences the public offline story mutation without changing notes", () => {
    expect(migration).toContain(
      "rename to apply_offline_line_mutation_product_core",
    );
    expect(migration).toContain(
      "create function public.apply_offline_line_mutation_atomic(",
    );
    expect(migration).toContain(
      "if p_action_type is distinct from 'save_story_draft' then",
    );
    expect(migration).toContain(
      "return private.apply_offline_line_mutation_product_core(",
    );
    expect(migration).toContain(
      "v_receipt_entity_id is distinct from p_work_order_line_id",
    );
    expect(migration).toContain(
      "The retained core resolves a concurrent unique-key claim",
    );
    expect(offlineRoute).toContain(
      'normalized.includes("work_order_product_access_busy")',
    );
    expect(offlineRoute).toContain("return 503");
    expect(offlineRoute).toContain(
      'normalized.includes("work_order_product_access_forbidden")',
    );
  });

  it("keeps the shared helper private and locks only active linked visits", () => {
    expect(migration).toContain(
      "create function private.work_order_command_product_access_locked(",
    );
    expect(migration).toContain(
      "revoke all on function private.work_order_command_product_access_locked(",
    );
    expect(migration).toContain("visit.assigned_user_id = p_profile_id");
    expect(migration).toContain("for update nowait");
    expect(migration).toContain("from public.profiles profile");
    expect(migration).toContain("p_lock_parent_first boolean default false");
    expect(migration).toContain("p_lock_segments boolean default false");
    expect(migration).toContain(
      "uuid, uuid, uuid, uuid, boolean, boolean",
    );
    expect(migration).toContain("from public.shops shop");
    expect(migration).toContain("from public.mobile_service_settings settings");
    expect(migration).toContain("from public.mobile_field_operators operator");
  });

  it("locks mutable product entitlement through delegated commands", () => {
    const shopLock = migration.indexOf("from public.shops shop");
    const shopDecision = migration.indexOf(
      "v_shop_entitled := public.profixiq_shop_has_product_access(",
    );
    const fieldSettingsLock = migration.indexOf(
      "from public.mobile_service_settings settings",
    );
    const fieldDecision = migration.indexOf(
      "v_field_entitled := public.mobile_profile_has_field_service_access(",
    );

    expect(shopLock).toBeGreaterThan(-1);
    expect(shopLock).toBeLessThan(shopDecision);
    expect(fieldSettingsLock).toBeGreaterThan(shopDecision);
    expect(fieldSettingsLock).toBeLessThan(fieldDecision);
  });

  it("requires Field technicians to own the line or active labor segment", () => {
    expect(migration).toContain("if not v_can_manage_field_work and (");
    expect(migration).toContain(") is not true then");
    expect(migration).toContain("assignment.technician_id = v_profile_id");
    expect(migration).toContain("segment.technician_id = v_profile_id");
    expect(migration).toContain("segment.ended_at is null");
  });

  it("includes canonical finish inspections in the outer retry lock set", () => {
    expect(migration).toContain("if v_action = 'finish' then");
    expect(migration).toContain("from public.inspections inspection");
    expect(migration).toContain(
      "inspection.work_order_line_id = p_work_order_line_id",
    );
    expect(migration).toContain("and inspection.is_canonical");
  });

  it("does not introduce or reshape database tables", () => {
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
  });
});
