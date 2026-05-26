import { describe, expect, it } from "vitest";
import {
  formatLaborSummary,
  formatPartsSummary,
  resolvePartsBottleneckDisplay,
  resolvePrimaryTechDisplay,
} from "./linePresentation";

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
    expect(formatLaborSummary(2.2, 319)).toContain("2.2h");
    expect(formatLaborSummary(2.2, 319)).toContain("$319.00");
  });

  it("formats parts summary with requested estimate", () => {
    const summary = formatPartsSummary({ partsCount: 1, partsTotal: 525 });
    expect(summary).toContain("1 requested");
    expect(summary).toContain("$525.00");
  });

  it("returns requested/backordered parts bottleneck display", () => {
    const display = resolvePartsBottleneckDisplay({
      hasRequestedMarker: true,
      holdReason: "Waiting for backordered ABS wheel speed sensor",
      partsTotal: 295,
    });
    expect(display?.heading).toBe("Parts Waiting");
    expect(display?.detail).toContain("ABS wheel speed sensor");
    expect(display?.detail).toContain("Backordered");
    expect(display?.detail).toContain("$295.00");
  });
});
