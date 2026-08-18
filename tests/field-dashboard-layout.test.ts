import { describe, expect, it } from "vitest";

import {
  FIELD_DASHBOARD_CARD_IDS,
  moveFieldDashboardCard,
  normalizeFieldDashboardLayout,
  setFieldDashboardCardVisibility,
} from "@/features/mobile/service/fieldDashboardLayout";

describe("Field dashboard layout", () => {
  it("restores every known card while rejecting unknown and duplicate entries", () => {
    const layout = normalizeFieldDashboardLayout([
      { id: "followups_due", y: 0, hidden: true },
      { id: "jobs_in_progress", y: 1 },
      { id: "followups_due", y: 2 },
      { id: "shop_revenue", y: 3 },
    ]);

    expect(layout.map((item) => item.id)).toEqual([
      "followups_due",
      "jobs_in_progress",
      "awaiting_approval",
      "parts_required",
      "truck_inventory",
      "unpaid_invoices",
      "purchase_orders",
    ]);
    expect(layout.find((item) => item.id === "followups_due")?.hidden).toBe(
      true,
    );
    expect(new Set(layout.map((item) => item.id))).toEqual(
      new Set(FIELD_DASHBOARD_CARD_IDS),
    );
  });

  it("moves a card relative to the controls the operator can actually use", () => {
    const layout = normalizeFieldDashboardLayout(null);
    const eligible = [
      "jobs_in_progress",
      "awaiting_approval",
      "unpaid_invoices",
      "followups_due",
    ] as const;

    const moved = moveFieldDashboardCard(
      layout,
      "unpaid_invoices",
      -1,
      eligible,
    );
    const eligibleOrder = moved
      .filter((item) => eligible.includes(item.id as (typeof eligible)[number]))
      .map((item) => item.id);

    expect(eligibleOrder).toEqual([
      "jobs_in_progress",
      "unpaid_invoices",
      "awaiting_approval",
      "followups_due",
    ]);
  });

  it("hides and restores optional cards without changing their order", () => {
    const initial = normalizeFieldDashboardLayout(null);
    const hidden = setFieldDashboardCardVisibility(
      initial,
      "followups_due",
      false,
    );
    const restored = setFieldDashboardCardVisibility(
      hidden,
      "followups_due",
      true,
    );

    expect(hidden.find((item) => item.id === "followups_due")?.hidden).toBe(
      true,
    );
    expect(
      restored.find((item) => item.id === "followups_due")?.hidden,
    ).toBeUndefined();
    expect(restored.map((item) => item.id)).toEqual(
      initial.map((item) => item.id),
    );
  });
});
