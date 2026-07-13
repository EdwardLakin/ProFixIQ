import { describe, expect, it } from "vitest";
import {
  formatLaborSummary,
  formatPartsSummary,
  resolvePartsBottleneckDisplay,
  resolvePrimaryTechDisplay,
} from "./linePresentation";
import {
  activeCanonicalWorkOrderParts,
  filterAllocationsNotBackedByCanonicalParts,
  getCanonicalPartDescription,
  getCanonicalPartTotal,
} from "./workOrderParts";
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

  it("adds active canonical parts to a labor-only line estimate using saved package snapshots", () => {
    const pricing = resolveWorkOrderLinePricing({
      line: { labor_time: 1, price_estimate: 140 },
      shopLaborRate: null,
      stagedParts: [
        { quantity: 1, quantity_requested: 1, unit_price: null, unit_sell_price_snapshot: 260.47, total_price: 260.47, is_active: true },
        { quantity: 6, quantity_requested: 6, unit_price: null, unit_sell_price_snapshot: 229.39, total_price: 1376.34, is_active: true },
      ],
    });
    expect(pricing.partsCount).toBe(2);
    expect(pricing.partsTotal).toBeCloseTo(1636.81, 2);
    expect(pricing.laborTotal).toBe(140);
    expect(pricing.lineTotal).toBeCloseTo(1776.81, 2);
    expect(formatLaborSummary(pricing.laborHours, pricing.laborTotal)).toContain("$140.00");
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

  it("formats parts summary with required count even when the saved estimate is zero", () => {
    const summary = formatPartsSummary({ partsCount: 2, partsTotal: 1636.81 });
    expect(summary).toContain("2 required");
    expect(summary).toContain("$1,636.81");
    expect(formatPartsSummary({ partsCount: 1, partsTotal: 0 })).not.toBe("No parts estimate");
  });

  it("returns requested/backordered parts bottleneck display without hard-coded product data", () => {
    const display = resolvePartsBottleneckDisplay({
      hasRequestedMarker: true,
      holdReason: "Waiting for backordered parts",
      partsTotal: 295,
    });
    expect(display?.heading).toBe("Parts Waiting");
    expect(display?.detail).toContain("Parts backordered");
    expect(display?.detail).toContain("$295.00");
    expect(display?.detail).not.toContain("ABS wheel speed sensor");
  });

  it("loads only active canonical work-order parts for the selected line before allocation", () => {
    const activeParts = activeCanonicalWorkOrderParts([
      { id: "filter", work_order_id: "wo", work_order_line_id: "line-a", shop_id: "shop", part_id: "p1", quantity: 1, quantity_requested: 1, unit_price: null, unit_sell_price_snapshot: 260.47, total_price: 260.47, description_snapshot: "ACDelco Oil Filter", is_active: true, created_at: null },
      { id: "oil", work_order_id: "wo", work_order_line_id: "line-a", shop_id: "shop", part_id: "p2", quantity: 6, quantity_requested: 6, unit_price: null, unit_sell_price_snapshot: 229.39, total_price: 1376.34, description_snapshot: "ACDelco 5W30 Oil", is_active: true, created_at: null },
      { id: "inactive", work_order_id: "wo", work_order_line_id: "line-a", shop_id: "shop", part_id: "p3", quantity: 1, unit_price: 10, total_price: 10, description_snapshot: "Inactive", is_active: false, created_at: null },
      { id: "other-line", work_order_id: "wo", work_order_line_id: "line-b", shop_id: "shop", part_id: "p4", quantity: 1, unit_price: 999, total_price: 999, description_snapshot: "Other line", is_active: true, created_at: null },
    ]).filter((part) => part.work_order_line_id === "line-a");

    expect(activeParts.map(getCanonicalPartDescription)).toEqual(["ACDelco Oil Filter", "ACDelco 5W30 Oil"]);
    expect(activeParts.reduce((sum, part) => sum + getCanonicalPartTotal(part), 0)).toBeCloseTo(1636.81, 2);
  });

  it("does not double-count allocations backed by canonical request items and does not require allocation for display", () => {
    const canonicalParts = [
      { source_parts_request_item_id: "request-item-1" },
      { source_parts_request_item_id: "request-item-2" },
    ];
    const allocations = [
      { source_request_item_id: "request-item-1", qty: 1, unit_cost: 260.47 },
      { source_request_item_id: null, qty: 1, unit_cost: 20 },
    ];

    expect(filterAllocationsNotBackedByCanonicalParts(allocations, canonicalParts)).toEqual([
      { source_request_item_id: null, qty: 1, unit_cost: 20 },
    ]);
  });
});
