import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shopLocalDateTimeToUtc } from "../features/shared/lib/utils/shopDayWindow";

const payroll = readFileSync("features/payroll-time/server/payrollTime.ts", "utf8");
const attendanceApi = readFileSync("app/api/scheduling/shifts/route.ts", "utf8");
const activity = readFileSync("features/workforce/server/buildWorkforceActivity.ts", "utf8");
const payrollUi = readFileSync("features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient.tsx", "utf8");
const shiftUi = readFileSync("features/shared/components/AppShell.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260717010050_workforce_time_reliability.sql",
  "utf8",
);

describe("workforce time reliability", () => {
  it("uses overlap semantics for attendance, activity, and payroll", () => {
    expect(attendanceApi).toContain('.or(`end_time.is.null,end_time.gt.${from}`)');
    expect(activity).toContain('.or(`end_time.is.null,end_time.gt.${from}`)');
    expect(payroll).toContain('.or(`end_time.is.null,end_time.gt.${rangeStart}`)');
  });

  it("uses canonical labor segments for productive time", () => {
    expect(attendanceApi).toContain("activity.summary.jobMinutesToday");
    expect(attendanceApi).not.toContain('.from("work_order_lines")');
  });

  it("keeps payroll approval blocked while integrity exceptions remain", () => {
    expect(payrollUi).toContain("summary.blocking > 0");
    expect(payrollUi).toContain("Boolean(refreshState?.refreshError)");
    expect(payrollUi).toContain("groupedEntries");
  });

  it("shows truthful header shift state", () => {
    expect(shiftUi).toContain("fetchMobileShiftState");
    expect(shiftUi).toContain("headerShiftState?.activity");
    expect(shiftUi).not.toContain('rounded-full bg-emerald-400 shadow');
  });

  it("converts shop-local schedule time across standard and daylight time", () => {
    expect(shopLocalDateTimeToUtc("2026-07-16", "08:00", "America/Edmonton")).toBe("2026-07-16T14:00:00.000Z");
    expect(shopLocalDateTimeToUtc("2026-01-16", "08:00", "America/Edmonton")).toBe("2026-01-16T15:00:00.000Z");
  });

  it("serializes new active shifts per employee and shop", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("enforce_single_active_tech_shift_trigger");
    expect(migration).toContain("tech_shifts_valid_time_range");
  });
});
