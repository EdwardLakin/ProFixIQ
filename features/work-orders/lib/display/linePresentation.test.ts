import { describe, expect, it } from "vitest";
import { formatLaborSummary, resolvePrimaryTechDisplay } from "./linePresentation";

describe("linePresentation", () => {
  it("returns Unassigned when tech is missing or non-tech profile", () => {
    expect(resolvePrimaryTechDisplay({ assigned_tech_id: null }, null)).toBe("Unassigned");
    expect(
      resolvePrimaryTechDisplay(
        { assigned_tech_id: "cc4edd23-aaaa-4bbb-8ccc-123456789012" },
        { id: "1", full_name: "Owner Demo", role: "owner" },
      ),
    ).toBe("Unassigned");
  });

  it("returns technician full name for resolvable tech profile", () => {
    expect(
      resolvePrimaryTechDisplay(
        { assigned_tech_id: "cc4edd23-aaaa-4bbb-8ccc-123456789012" },
        { id: "1", full_name: "Lead Tech", role: "tech" },
      ),
    ).toBe("Lead Tech");
  });

  it("formats labor summary with non-zero labor dollars", () => {
    expect(formatLaborSummary(0.8, 116)).toContain("0.8h");
    expect(formatLaborSummary(0.8, 116)).toContain("$116.00");
  });
});

