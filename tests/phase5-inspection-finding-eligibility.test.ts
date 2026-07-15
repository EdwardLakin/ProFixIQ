import { describe, expect, it } from "vitest";
import { isInspectionFindingEligible } from "@/features/work-orders/lib/work-orders/inspectionFindingEligibility";

describe("Phase 5 inspection finding eligibility", () => {
  it("rejects OK and N/A observations regardless of title classification", () => {
    expect(isInspectionFindingEligible({ status: "ok" })).toBe(false);
    expect(isInspectionFindingEligible({ status: "na" })).toBe(false);
    expect(isInspectionFindingEligible({ status: "N/A" })).toBe(false);
  });

  it("accepts failed and recommended findings", () => {
    expect(isInspectionFindingEligible({ status: "fail" })).toBe(true);
    expect(isInspectionFindingEligible({ status: "recommend" })).toBe(true);
    expect(isInspectionFindingEligible({ recommend: true })).toBe(true);
  });

  it("accepts explicit technician recommendation metadata", () => {
    expect(
      isInspectionFindingEligible({
        status: "unknown",
        recommendation: "Replace during this visit",
      }),
    ).toBe(true);
    expect(
      isInspectionFindingEligible({
        status: null,
        recommendationType: "maintenance",
      }),
    ).toBe(true);
  });

  it("does not treat an unclassified observation as eligible", () => {
    expect(isInspectionFindingEligible({ status: null })).toBe(false);
    expect(isInspectionFindingEligible({ status: "unknown" })).toBe(false);
  });
});
