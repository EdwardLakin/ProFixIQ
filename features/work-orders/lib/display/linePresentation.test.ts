import { describe, expect, it } from "vitest";
import {
  formatLaborSummary,
  formatPartsSummary,
  resolvePartsBottleneckDisplay,
  resolvePrimaryTechDisplay,
} from "./linePresentation";
import { resolveWorkOrderLinePricing } from "../pricing/resolveWorkOrderLinePricing";

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

  it("adds active canonical parts to a labor-only line estimate", () => {
    const pricing = resolveWorkOrderLinePricing({
      line: { labor_time: 2.2, price_estimate: 319 },
      shopLaborRate: null,
      stagedParts: [{ quantity: 1, unit_price: 525, total_price: 525 }],
    });
    expect(pricing.laborHours).toBe(2.2);
    expect(pricing.partsTotal).toBe(525);
    expect(pricing.laborTotal).toBe(319);
    expect(pricing.lineTotal).toBe(844);
    expect(formatLaborSummary(pricing.laborHours, pricing.laborTotal)).toContain("$319.00");
  });

  it("does not collapse to zero labor when line total exists without parts", () => {
    const pricing = resolveWorkOrderLinePricing({
      line: { labor_time: 0.6, price_estimate: 87 },
      shopLaborRate: null,
    });
    expect(pricing.laborHours).toBe(0.6);
    expect(pricing.partsTotal).toBe(0);
    expect(pricing.laborTotal).toBe(87);
    expect(formatLaborSummary(pricing.laborHours, pricing.laborTotal)).toContain("$87.00");
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
