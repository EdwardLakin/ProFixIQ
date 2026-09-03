import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260903181511_enforce_work_order_command_product_boundary.sql";
const migration = readFileSync(migrationPath, "utf8");

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
    ).toHaveLength(4);
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
  });

  it("requires Field technicians to own the line or active labor segment", () => {
    expect(migration).toContain("if not v_can_manage_field_work and not (");
    expect(migration).toContain("assignment.technician_id = v_profile_id");
    expect(migration).toContain("segment.technician_id = v_profile_id");
    expect(migration).toContain("segment.ended_at is null");
  });

  it("does not introduce or reshape database tables", () => {
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
  });
});
