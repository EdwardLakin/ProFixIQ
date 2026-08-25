import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260825043537_create_manual_work_order_line_atomic.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const functionBody = migration.slice(
  migration.indexOf(
    "create function public.create_manual_work_order_line_atomic",
  ),
  migration.indexOf(
    "comment on function public.create_manual_work_order_line_atomic",
  ),
);

describe("manual Work Order line atomic SQL contract", () => {
  it("is an additive command and private durable-receipt boundary", () => {
    expect(functionBody).toContain(
      "create function public.create_manual_work_order_line_atomic",
    );
    expect(functionBody).toContain("security definer");
    expect(functionBody).toContain("set search_path = ''");
    expect(functionBody).toContain(
      "coalesce(auth.role(), '') <> 'service_role'",
    );
    expect(migration).not.toContain("create or replace function");
    expect(migration).toContain(
      "create table public.manual_work_order_line_creation_receipts",
    );
    expect(migration).toContain(
      "alter table public.manual_work_order_line_creation_receipts enable row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.manual_work_order_line_creation_receipts",
    );
    expect(migration).not.toMatch(/\bcreate (?:constraint )?trigger\b/i);
    expect(migration).not.toMatch(/\bcreate policy\b/i);
  });

  it("binds the canonical profile to auth identity, tenant, and established roles", () => {
    expect(functionBody).toContain("profile.id = p_actor_profile_id");
    expect(functionBody).toContain("profile.shop_id = p_shop_id");
    expect(functionBody).toContain("profile.id = p_authenticated_user_id");
    expect(functionBody).toContain("profile.user_id = p_authenticated_user_id");
    for (const role of [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "mechanic",
      "lead_hand",
      "foreman",
    ]) {
      expect(functionBody).toContain(`'${role}'`);
    }
    const roleGuard = functionBody.slice(
      functionBody.indexOf(
        "if lower(btrim(coalesce(v_actor.role::text, ''))) not in",
      ),
      functionBody.indexOf(
        "message = 'MANUAL_WORK_ORDER_LINE_ACTOR_FORBIDDEN';",
      ),
    );
    expect(roleGuard).not.toContain("'parts'");
    expect(functionBody).toContain("v_actor_role = 'mechanic'");
    expect(functionBody).toContain(
      "assigned_line.work_order_id = v_work_order.id",
    );
    expect(functionBody).toContain(
      "assignment.technician_id = v_actor.id",
    );
  });

  it("locks the tenant-scoped parent and derives child tenant and vehicle identity", () => {
    expect(functionBody).toMatch(
      /from public\.work_orders work_order[\s\S]*work_order\.id = p_work_order_id[\s\S]*work_order\.shop_id = p_shop_id[\s\S]*for update;/,
    );
    expect(functionBody).toContain("v_work_order.vehicle_id");
    expect(functionBody).toContain("v_work_order.shop_id");
    expect(functionBody).not.toContain("p_vehicle_id");
    expect(functionBody).not.toMatch(
      /values \([\s\S]*p_shop_id,[\s\S]*v_actor\.id,/,
    );
  });

  it("defensively validates route-bounded numeric and enum inputs", () => {
    expect(functionBody).toContain("p_labor_time < 0");
    expect(functionBody).toContain("p_labor_time > 1000");
    expect(functionBody).toContain("p_urgency is null");
    expect(functionBody).toContain(
      "p_urgency not in ('low', 'medium', 'high')",
    );
    expect(functionBody).toContain(
      "v_parts_text text := nullif(p_parts_text, '')",
    );
  });

  it("persists a hashed stable-UUID receipt before lifecycle lock checks", () => {
    expect(functionBody).toContain("jsonb_build_object(");
    expect(functionBody).toContain("extensions.digest(");
    expect(functionBody).toContain("'sha256'");
    expect(functionBody).toContain(
      "insert into public.manual_work_order_line_creation_receipts",
    );
    expect(functionBody).toContain("on conflict (line_id) do nothing");
    expect(functionBody).toContain("if not v_receipt_inserted then");
    for (const comparison of [
      "v_existing.work_order_id is not distinct from v_work_order.id",
      "v_existing.vehicle_id is not distinct from v_work_order.vehicle_id",
      "v_existing.complaint is not distinct from v_complaint",
      "v_existing.cause is null",
      "v_existing.correction is not distinct from v_correction",
      "v_existing.labor_time is not distinct from v_labor_time",
      "v_existing.parts is not distinct from v_parts_text",
      "v_existing.status is not distinct from 'awaiting_approval'",
      "v_existing.approval_state is not distinct from 'pending'",
      "v_existing.job_type is not distinct from 'repair'",
      "v_existing.shop_id is not distinct from v_work_order.shop_id",
      "v_existing.user_id is not distinct from p_authenticated_user_id",
      "v_existing.urgency is not distinct from p_urgency",
    ]) {
      expect(functionBody).toContain(comparison);
    }

    const idempotentReturn = functionBody.indexOf("'idempotent', true");
    const closedCheck = functionBody.indexOf("if v_parent_status in (");
    for (const terminalStatus of [
      "archived",
      "cancelled",
      "canceled",
      "closed",
      "completed",
      "done",
      "invoiced",
      "paid",
      "void",
      "voided",
    ]) {
      expect(functionBody).toContain(`'${terminalStatus}'`);
    }
    const paidCheck = functionBody.indexOf(
      "lower(btrim(coalesce(v_work_order.payment_status::text, ''))) = 'paid'",
    );
    const financialCheck = functionBody.indexOf(
      "public.work_order_is_financially_locked",
    );
    expect(idempotentReturn).toBeGreaterThan(0);
    expect(idempotentReturn).toBeLessThan(closedCheck);
    expect(idempotentReturn).toBeLessThan(paidCheck);
    expect(idempotentReturn).toBeLessThan(financialCheck);
    expect(functionBody).toContain("when unique_violation then");
    expect(functionBody).toContain(
      "message = 'MANUAL_WORK_ORDER_LINE_ID_CONFLICT'",
    );
  });

  it("inserts exactly the existing AddJobLinePayload columns and values", () => {
    const insert = functionBody.slice(
      functionBody.indexOf("insert into public.work_order_lines"),
      functionBody.indexOf("exception\n    when unique_violation"),
    );
    for (const value of [
      "v_complaint",
      "null",
      "v_correction",
      "v_labor_time",
      "v_parts_text",
      "'awaiting_approval'",
      "'pending'",
      "'repair'",
      "v_work_order.shop_id",
      "p_authenticated_user_id",
      "p_urgency",
    ]) {
      expect(insert).toContain(value);
    }
    expect(insert).not.toMatch(/\bdescription\b/);
    expect(insert).not.toMatch(/\bnotes\b/);
    expect(insert).not.toMatch(/\bline_type\b/);
    expect(insert).not.toContain("v_actor.id");
  });

  it("exposes the new function to service_role only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.create_manual_work_order_line_atomic\([\s\S]*?\) from public, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.create_manual_work_order_line_atomic\([\s\S]*?\) to service_role;/,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.create_manual_work_order_line_atomic\([\s\S]*?\) to (?:public|anon|authenticated)/,
    );
  });
});
