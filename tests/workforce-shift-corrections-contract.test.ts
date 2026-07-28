import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ui = readFileSync(
  "features/dashboard/app/dashboard/workforce/AttendanceOverviewClient.tsx",
  "utf8",
);
const route = readFileSync("app/api/workforce/attendance/corrections/route.ts", "utf8");
const migration = readFileSync("supabase/manual/20260710_workforce_w1a_shift_corrections.sql", "utf8");
const evidenceHardeningMigration = readFileSync(
  "supabase/migrations/20260728213700_harden_shift_correction_evidence.sql",
  "utf8",
);
const payroll = readFileSync("features/payroll-time/server/payrollTime.ts", "utf8");

describe("Workforce W1A shift correction contract", () => {
  it("keeps every actual-time correction in the canonical Attendance UI", () => {
    expect(ui).not.toContain('`/api/scheduling/shifts/${shiftId}`');
    expect(ui).not.toContain('fetchJson<{ ok: true }>("/api/scheduling/shifts"');
    expect(ui).not.toContain("/api/scheduling/punches");
    expect(ui).toContain("/api/workforce/attendance/corrections");
    expect(ui).toContain('"create_missing_shift"');
    expect(ui).toContain('"adjust_start_and_end"');
    expect(ui).toContain('"adjust_punch"');
    expect(ui).toContain('"void_shift"');
    expect(ui).toContain("Add missing timecard");
    expect(ui).toContain("Correct timecard");
    expect(ui).toContain("Void timecard");
  });

  it("requires audited correction reasons and server-side actor authorization", () => {
    expect(route).toContain("A correction reason of at least 3 characters is required");
    expect(route).toContain("canManageScheduling");
    expect(route).toContain('auth.canonicalRole !== "owner"');
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
    expect(evidenceHardeningMigration).toContain(
      "set search_path = ''",
    );
    expect(evidenceHardeningMigration).toContain(
      "at time zone v_shop_timezone",
    );
    expect(evidenceHardeningMigration).toContain(
      "update public.punch_events",
    );
    expect(evidenceHardeningMigration).toContain(
      "Admin correction: effective boundary start%",
    );
    expect(evidenceHardeningMigration).toContain(
      "Admin correction: effective boundary end%",
    );
    expect(evidenceHardeningMigration).toContain(
      "End the active shift before voiding its timecard",
    );
    expect(evidenceHardeningMigration).toContain(
      ") from public, anon, authenticated;",
    );
  });

  it("keeps voided shifts out of payroll materialization", () => {
    expect(payroll).toContain('.neq("excluded_from_payroll", true)');
  });
});
