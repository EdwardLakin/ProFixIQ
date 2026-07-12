import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { localDateToUtcBoundary, toShopDate } from "../features/payroll-time/server/payrollTime";

const routeSource = readFileSync("app/api/payroll-time/periods/route.ts", "utf8");
const payrollSource = readFileSync("features/payroll-time/server/payrollTime.ts", "utf8");
const uiSource = readFileSync("features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient.tsx", "utf8");

describe("payroll time open-period visibility contract", () => {
  it("auto-refreshes open periods before loading entries and distinguishes refresh failure", () => {
    expect(routeSource).toContain("refreshOpenPeriodIfStale");
    expect(routeSource.indexOf("refreshOpenPeriodIfStale")).toBeLessThan(routeSource.indexOf('.from("payroll_time_entries")'));
    expect(routeSource).toContain("Time records exist, but payroll totals could not be refreshed.");
    expect(routeSource).toContain("No employee time has been recorded for this pay period.");
  });

  it("does not hide source attendance behind workforce payroll_ready flags", () => {
    expect(payrollSource).toContain('.from("tech_shifts")');
    expect(payrollSource).toContain('.from("work_order_line_labor_segments")');
    expect(payrollSource).not.toMatch(/from\("tech_shifts"\)[\s\S]{0,700}payroll_ready/);
    expect(payrollSource).not.toMatch(/from\("work_order_line_labor_segments"\)[\s\S]{0,700}payroll_ready/);
  });

  it("uses profiles fallback for snapshot/source employees without workforce profile rows", () => {
    expect(routeSource).toContain('.from("profiles")');
    expect(routeSource).toContain("fallbackProfileById");
  });

  it("removes derived-entry and rebuild-first terminology from the primary workflow", () => {
    expect(uiSource).not.toContain("No derived entries");
    expect(uiSource).not.toContain("Rebuild from source");
    expect(uiSource).toContain("Approve Payroll");
    expect(uiSource).toContain("Export Payroll");
    expect(uiSource).toContain("Recalculate");
  });
});

describe("payroll time shop-local period boundaries", () => {
  it("includes a Calgary evening shift crossing UTC midnight on the local work date", () => {
    expect(toShopDate("2026-07-02T03:30:00.000Z", "America/Edmonton")).toBe("2026-07-01");
  });

  it("uses shift-start local date for overnight shift work_date", () => {
    expect(toShopDate("2026-07-02T05:30:00.000Z", "America/Edmonton")).toBe("2026-07-01");
  });

  it("builds period boundaries from shop-local calendar days", () => {
    expect(localDateToUtcBoundary("2026-07-01", "America/Edmonton")).toBe("2026-07-01T06:00:00.000Z");
    expect(localDateToUtcBoundary("2026-07-01", "UTC")).toBe("2026-07-01T00:00:00.000Z");
  });
});
