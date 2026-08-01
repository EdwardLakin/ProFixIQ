import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPayrollPeriodRanges } from "@/features/payroll-time/lib/payPeriodBounds";

const migrationSource = readFileSync(
  "supabase/migrations/20260801051252_fix_payroll_period_pipeline.sql",
  "utf8",
);
const cleanupMigrationSource = readFileSync(
  "supabase/migrations/20260801053356_deduplicate_payroll_period_index.sql",
  "utf8",
);
const payrollSource = readFileSync(
  "features/payroll-time/server/payrollTime.ts",
  "utf8",
);
const periodsRouteSource = readFileSync(
  "app/api/payroll-time/periods/route.ts",
  "utf8",
);
const settingsRouteSource = readFileSync(
  "app/api/payroll-time/settings/route.ts",
  "utf8",
);
const payrollUiSource = readFileSync(
  "features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient.tsx",
  "utf8",
);

describe("payroll period history generation", () => {
  it("materializes every bi-weekly period covering existing source time", () => {
    expect(
      buildPayrollPeriodRanges({
        firstWorkDate: "2026-07-10",
        currentWorkDate: "2026-07-31",
        cadence: "biweekly",
        weekStartsOn: 1,
        anchorDate: "2024-01-01",
      }),
    ).toEqual([
      { periodStart: "2026-06-29", periodEnd: "2026-07-12" },
      { periodStart: "2026-07-13", periodEnd: "2026-07-26" },
      { periodStart: "2026-07-27", periodEnd: "2026-08-09" },
    ]);
  });

  it("handles semi-monthly and monthly boundaries without gaps", () => {
    expect(
      buildPayrollPeriodRanges({
        firstWorkDate: "2026-01-14",
        currentWorkDate: "2026-02-02",
        cadence: "semimonthly",
        weekStartsOn: 1,
      }),
    ).toEqual([
      { periodStart: "2026-01-01", periodEnd: "2026-01-15" },
      { periodStart: "2026-01-16", periodEnd: "2026-01-31" },
      { periodStart: "2026-02-01", periodEnd: "2026-02-15" },
    ]);
    expect(
      buildPayrollPeriodRanges({
        firstWorkDate: "2026-01-31",
        currentWorkDate: "2026-03-01",
        cadence: "monthly",
        weekStartsOn: 1,
      }),
    ).toEqual([
      { periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      { periodStart: "2026-02-01", periodEnd: "2026-02-28" },
      { periodStart: "2026-03-01", periodEnd: "2026-03-31" },
    ]);
  });
});

describe("payroll period persistence and authorization contract", () => {
  it("writes both live date-column pairs and resolves concurrent creation idempotently", () => {
    expect(payrollSource).toContain("start_date: range.periodStart");
    expect(payrollSource).toContain("end_date: range.periodEnd");
    expect(payrollSource).toContain(
      'onConflict: "shop_id,period_start,period_end"',
    );
    expect(payrollSource).toContain("ignoreDuplicates: true");
    expect(migrationSource).toContain(
      "create trigger payroll_pay_periods_sync_date_aliases",
    );
    expect(migrationSource).toContain("payroll_pay_periods_shop_period_key");
    expect(cleanupMigrationSource).toContain(
      "ux_payroll_pay_periods_shop_period",
    );
    expect(cleanupMigrationSource).toContain(
      "drop index if exists public.payroll_pay_periods_shop_period_key",
    );
  });

  it("makes payroll mutations server-only and keeps scoped reviewer reads", () => {
    expect(migrationSource).toContain(
      "revoke insert, update, delete on table public.payroll_pay_periods",
    );
    expect(migrationSource).toContain(
      "revoke insert, update, delete on table public.shop_payroll_settings",
    );
    expect(migrationSource).toContain("from public, anon, authenticated");
    expect(migrationSource).toContain("to service_role");
    expect(migrationSource).toContain(
      "shop_id = (select public.profixiq_workforce_shop_id())",
    );
    expect(migrationSource).toContain(
      "and (select public.profixiq_can_manage_workforce())",
    );
  });

  it("uses one settings implementation and preserves omitted policy fields", () => {
    expect(periodsRouteSource).toContain(
      'export { PUT } from "../settings/route"',
    );
    expect(payrollUiSource).toContain('fetch("/api/payroll-time/settings"');
    expect(settingsRouteSource).toContain(
      "existing?.daily_overtime_after_minutes ?? 480",
    );
    expect(settingsRouteSource).toContain(
      "existing?.weekly_overtime_after_minutes ?? 2400",
    );
    expect(settingsRouteSource).toContain("getOrCreateCurrentPeriod");
  });

  it("does not represent an API failure as zero payroll", () => {
    expect(payrollUiSource).toContain("Payroll is unavailable");
    expect(payrollUiSource).toContain(
      "This is a payroll assembly failure, not a zero-time result.",
    );
    expect(periodsRouteSource).toContain(
      "Payroll is temporarily unavailable. Recorded punches are safe",
    );
  });
});
