import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ui = readFileSync("features/dashboard/app/dashboard/admin/SchedulingClient.tsx", "utf8");
const route = readFileSync("app/api/workforce/attendance/corrections/route.ts", "utf8");
const migration = readFileSync("supabase/manual/20260710_workforce_w1a_shift_corrections.sql", "utf8");
const payroll = readFileSync("features/payroll-time/server/payrollTime.ts", "utf8");

describe("Workforce W1A shift correction contract", () => {
  it("removes legacy actual-shift create/update/delete calls from the admin UI", () => {
    expect(ui).not.toContain('`/api/scheduling/shifts/${shiftId}`');
    expect(ui).not.toContain('fetchJson<{ ok: true }>("/api/scheduling/shifts"');
    expect(ui).not.toContain('onUpdateShiftTime');
    expect(ui).not.toContain('onDeleteShift');
    expect(ui).not.toContain("onDuplicateShift");
    expect(ui).toContain("/api/workforce/attendance/corrections");
    expect(ui).toContain("Duplicate actual shifts is disabled");
    expect(ui).toContain("Void shift");
    expect(ui).toContain("Add missing worked shift");
  });

  it("requires audited correction reasons and server-side actor authorization", () => {
    expect(route).toContain("A correction reason of at least 3 characters is required");
    expect(route).toContain("canManageScheduling");
    expect(route).toContain('body.target_user_id === auth.me.id && auth.me.role !== "owner"');
    expect(route).toContain("Only an owner can apply an audited correction to their own time.");
    expect(route).toContain("apply_shift_correction");
    expect(route).not.toContain("actor_profile_id?:");
  });

  it("models correction records, void exclusion, payroll locking, and rollback-capable RPC behavior", () => {
    expect(migration).toContain("create table if not exists public.shift_corrections");
    expect(migration).toContain("excluded_from_payroll boolean not null default false");
    expect(migration).toContain("for update");
    expect(migration).toContain("Approved/exported payroll periods are locked");
    expect(migration).toContain("insert into public.audit_logs");
    expect(migration).toContain("insert into public.punch_events");
    expect(migration).toContain("Corrected shift overlaps another non-voided shift");
  });

  it("keeps voided shifts out of payroll materialization", () => {
    expect(payroll).toContain('.neq("excluded_from_payroll", true)');
  });
});
