import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "features/work-orders/lib/work-orders/insertPrioritizedJobsFromInspection.ts",
  "utf8",
);

describe("Phase 5 legacy inspection import contract", () => {
  it("checks eligibility before keyword classification", () => {
    const eligibilityIndex = source.indexOf("if (!isInspectionFindingEligible(item)) continue;");
    const diagnosisIndex = source.indexOf("diagnosisKeywords.some");
    const maintenanceIndex = source.indexOf("maintenanceKeywords.some");

    expect(eligibilityIndex).toBeGreaterThan(-1);
    expect(diagnosisIndex).toBeGreaterThan(eligibilityIndex);
    expect(maintenanceIndex).toBeGreaterThan(eligibilityIndex);
  });

  it("does not retain the old job-type eligibility bypass", () => {
    expect(source).not.toContain("jobType !== \"repair\"");
    expect(source).not.toContain("shouldIncludeInspectionItem");
  });

  it("keeps canonical quote creation as the only write path", () => {
    expect(source).toContain("createCanonicalQuoteLines");
    expect(source).not.toContain('.from("work_order_lines").insert');
  });
});
