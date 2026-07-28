import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { escapePayrollCsvCell } from "@/features/payroll-time/server/payrollTime";

const migration = readFileSync(
  "supabase/migrations/20260728213800_payroll_export_artifact_integrity.sql",
  "utf8",
);
const payrollSource = readFileSync(
  "features/payroll-time/server/payrollTime.ts",
  "utf8",
);
const downloadRoute = readFileSync(
  "app/api/payroll-time/exports/[batchId]/download/route.ts",
  "utf8",
);

describe("payroll export artifact integrity", () => {
  it("creates the private artifact contract and required metadata", () => {
    expect(migration).toContain("add column if not exists storage_bucket");
    expect(migration).toContain("add column if not exists storage_path");
    expect(migration).toContain("add column if not exists file_sha256");
    expect(migration).toContain("add column if not exists download_count");
    expect(migration).toContain("'payroll-exports'");
    expect(migration).toContain("false");
  });

  it("finalizes the batch, pay period, and audit evidence atomically", () => {
    expect(migration).toContain(
      "create or replace function public.finalize_payroll_export_atomic",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("'payroll.export.generated'");
    expect(payrollSource).toContain(
      '"finalize_payroll_export_atomic"',
    );
    expect(payrollSource).toContain(".remove([storagePath])");
  });

  it("records downloads with a concurrency-safe database increment", () => {
    expect(migration).toContain(
      "create or replace function public.record_payroll_export_download_atomic",
    );
    expect(migration).toContain("download_count = download_count + 1");
    expect(migration).toContain("'payroll.export.downloaded'");
    expect(downloadRoute).toContain(
      '"record_payroll_export_download_atomic"',
    );
    expect(downloadRoute).not.toContain("Promise.all([");
  });

  it("exports readable employee names instead of profile UUIDs", () => {
    expect(payrollSource).toContain('"employee_name"');
    expect(payrollSource).not.toContain(
      'const csvHeaders = ["user_id"',
    );
    expect(payrollSource).toContain("employeeNameById");
  });

  it("escapes names safely for standards-compatible CSV output", () => {
    expect(escapePayrollCsvCell("Alex Smith")).toBe("Alex Smith");
    expect(escapePayrollCsvCell("Smith, Alex")).toBe('"Smith, Alex"');
    expect(escapePayrollCsvCell('Alex "Ace" Smith')).toBe(
      '"Alex ""Ace"" Smith"',
    );
    expect(escapePayrollCsvCell("Alex\nSmith")).toBe('"Alex\nSmith"');
  });
});
