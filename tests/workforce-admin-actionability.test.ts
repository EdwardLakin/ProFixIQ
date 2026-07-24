import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculatePayPeriodBounds } from "../features/payroll-time/lib/payPeriodBounds";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

const attendanceUi = readFileSync("features/dashboard/app/dashboard/workforce/AttendanceOverviewClient.tsx", "utf8");
const correctionRoute = readFileSync("app/api/workforce/attendance/corrections/route.ts", "utf8");
const payrollUi = readFileSync("features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient.tsx", "utf8");
const workforceNavigation = readFileSync("features/dashboard/app/dashboard/workforce/workforceNavigation.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260717020000_workforce_admin_actionability.sql", "utf8");

describe("workforce admin actionability", () => {
  it("calculates weekly periods from the configured week start", () => {
    const period = calculatePayPeriodBounds({
      shopDate: new Date("2026-07-17T00:00:00.000Z"),
      cadence: "weekly",
      weekStartsOn: 1,
    });
    expect(isoDate(period.start)).toBe("2026-07-13");
    expect(isoDate(period.end)).toBe("2026-07-19");
  });

  it("calculates bi-weekly periods from the shop anchor", () => {
    const period = calculatePayPeriodBounds({
      shopDate: new Date("2026-07-17T00:00:00.000Z"),
      cadence: "biweekly",
      weekStartsOn: 1,
      anchorDate: "2026-07-06",
    });
    expect(isoDate(period.start)).toBe("2026-07-06");
    expect(isoDate(period.end)).toBe("2026-07-19");
  });

  it("calculates both semi-monthly windows", () => {
    const first = calculatePayPeriodBounds({
      shopDate: new Date("2026-07-12T00:00:00.000Z"),
      cadence: "semimonthly",
      weekStartsOn: 1,
    });
    const second = calculatePayPeriodBounds({
      shopDate: new Date("2026-07-27T00:00:00.000Z"),
      cadence: "semimonthly",
      weekStartsOn: 1,
    });
    expect([isoDate(first.start), isoDate(first.end)]).toEqual(["2026-07-01", "2026-07-15"]);
    expect([isoDate(second.start), isoDate(second.end)]).toEqual(["2026-07-16", "2026-07-31"]);
  });

  it("handles monthly leap-year boundaries", () => {
    const period = calculatePayPeriodBounds({
      shopDate: new Date("2028-02-12T00:00:00.000Z"),
      cadence: "monthly",
      weekStartsOn: 1,
    });
    expect([isoDate(period.start), isoDate(period.end)]).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("connects punch rows to audited shop-timezone corrections", () => {
    expect(attendanceUi).toContain('type="datetime-local"');
    expect(attendanceUi).toContain('correction_type: "adjust_punch"');
    expect(correctionRoute).toContain("shopLocalDateTimeToUtc");
    expect(correctionRoute).toContain('admin.rpc("apply_punch_correction"');
    expect(migration).toContain("Approved/exported payroll periods are locked");
    expect(migration).toContain("workforce.punch.corrected");
  });

  it("exposes every payroll cadence and actionable admin drill-downs", () => {
    for (const cadence of ["weekly", "biweekly", "semimonthly", "monthly"]) {
      expect(payrollUi).toContain(`value="${cadence}"`);
    }
    expect(workforceNavigation).toContain('href: "/dashboard/workforce/payroll-review"');
    expect(workforceNavigation).toContain('href: "/dashboard/workforce/activity"');
  });
});
