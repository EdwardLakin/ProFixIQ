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
const flatRateCreditsRoute = source(
  "app/api/workforce/flat-rate/credits/route.ts",
);
const timeOffRequestRoute = source("app/api/time-off/requests/route.ts");
const inspectionSaveRoute = source("app/api/inspections/save/route.ts");

describe("workforce and inspection mutating RPC ACL hardening", () => {
  it("keeps privileged workforce mutations behind service-role routes", () => {
    expect(jobTimeCorrectionRoute).toContain(
      'requiredCapability: "canReviewWorkforceTime"',
    );
    expect(jobTimeCorrectionRoute).toContain("const admin = createAdminSupabase()");
    expect(jobTimeCorrectionRoute).toContain(
      '"correct_work_order_line_labor_segment"',
    );

    expect(flatRateCreditsRoute).toContain(
      'requiredCapability: "canReviewWorkforceTime"',
    );
    expect(flatRateCreditsRoute).toContain("const admin = createAdminSupabase()");
    expect(flatRateCreditsRoute).toContain(
      '"replace_work_order_line_flat_rate_credits"',
    );

    expect(timeOffRequestRoute).toContain("requireShopScopedApiAccess");
    expect(timeOffRequestRoute).toContain("const admin = createAdminSupabase()");
    expect(timeOffRequestRoute).toContain('"submit_staff_time_off_request"');

    for (const functionName of [
      "correct_work_order_line_labor_segment",
      "replace_work_order_line_flat_rate_credits",
      "submit_staff_time_off_request",
    ]) {
      expect(migration).toContain(`function public.${functionName}`);
    }

    expect(migration.match(/from public, anon, authenticated;/g)).toHaveLength(3);
    expect(migration.match(/to service_role;/g)).toHaveLength(3);
    expect(migration).toContain(
      "RPC hardening failed: job-time correction ACL is unsafe",
    );
    expect(migration).toContain(
      "RPC hardening failed: flat-rate credit ACL is unsafe",
    );
    expect(migration).toContain(
      "RPC hardening failed: time-off request ACL is unsafe",
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
