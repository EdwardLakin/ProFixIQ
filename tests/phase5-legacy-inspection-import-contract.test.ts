import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260715060100_phase5_atomic_inspection_quote_import.sql",
  "utf8",
);

describe("Phase 5 legacy inspection import contract", () => {
  it("checks eligibility before keyword classification", () => {
    const eligibilityIndex = source.indexOf(
      "if (!title || !isExplicitInspectionRecommendation(item)) continue;",
    );
    const classificationIndex = source.indexOf(
      "classifyEligibleInspectionFinding({",
    );

    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(classificationIndex).toBeGreaterThan(eligibilityIndex);
  });

  it("does not retain the old job-type eligibility bypass", () => {
    expect(source).not.toContain("jobType !== \"repair\"");
    expect(source).not.toContain("shouldIncludeInspectionItem");
  });

  it("keeps canonical quote creation as the only write path", () => {
    expect(source).toContain('"import_inspection_quote_package_atomic"');
    expect(source).not.toContain('.from("work_order_lines").insert');
    expect(migration).toContain("insert into public.work_order_quote_lines");
    expect(migration).toContain("insert into public.quote_lifecycle_operation_keys");
  });
});
