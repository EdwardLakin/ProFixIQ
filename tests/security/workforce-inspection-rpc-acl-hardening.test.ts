import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20260821151500_harden_workforce_inspection_rpc_acl.sql",
);
const jobTimeCorrectionRoute = source(
  "app/api/workforce/job-time/corrections/route.ts",
);
const inspectionSaveRoute = source("app/api/inspections/save/route.ts");

describe("workforce and inspection mutating RPC ACL hardening", () => {
  it("keeps job-time correction behind the capability-gated service-role route", () => {
    expect(jobTimeCorrectionRoute).toContain(
      'requiredCapability: "canReviewWorkforceTime"',
    );
    expect(jobTimeCorrectionRoute).toContain("const admin = createAdminSupabase()");
    expect(jobTimeCorrectionRoute).toContain(
      '"correct_work_order_line_labor_segment"',
    );
    expect(migration).toContain(
      "function public.correct_work_order_line_labor_segment",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain(
      "RPC hardening failed: job-time correction ACL is unsafe",
    );
  });

  it("keeps inspection autosave authenticated while denying anonymous execution", () => {
    expect(inspectionSaveRoute).toContain("await supabase.auth.getUser()");
    expect(inspectionSaveRoute).toContain(
      '"save_inspection_progress_v3_atomic"',
    );

    for (const functionName of [
      "save_inspection_progress_atomic",
      "save_inspection_progress_v2_atomic",
      "save_inspection_progress_v3_atomic",
    ]) {
      expect(migration).toContain(`function public.${functionName}`);
    }

    expect(migration.match(/from public, anon;/g)).toHaveLength(3);
    expect(migration.match(/to authenticated, service_role;/g)).toHaveLength(3);
    expect(migration).toContain(
      "RPC hardening failed: inspection progress writer ACL is unsafe",
    );
  });

  it("is a forward-only ACL migration", () => {
    expect(migration).toMatch(/^begin;/);
    expect(migration).toMatch(/commit;\s*$/);
    expect(migration).not.toMatch(
      /\b(?:drop|alter|create)\s+(?:table|column|type|function)\b/i,
    );
  });
});
