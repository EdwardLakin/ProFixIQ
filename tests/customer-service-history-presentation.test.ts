import { describe, expect, it } from "vitest";

import {
  customerServiceHistoryPresentation,
  formatOdometer,
} from "@/features/customers/lib/customerServiceHistory";

describe("customer service-history presentation", () => {
  it("does not invent miles when the canonical odometer unit is unknown", () => {
    expect(formatOdometer("216751", null)).toBe("216,751");
    expect(formatOdometer("216751", "km")).toBe("216,751 km");
  });

  it("presents canonical estimates as estimates with the estimate route", () => {
    expect(
      customerServiceHistoryPresentation({
        id: "estimate-1",
        custom_id: "000013",
        status: "new",
        record_type: "estimate",
        estimate_number: "EST-06A7D9326B",
        estimate_status: "waiting_for_parts",
      }),
    ).toEqual({
      href: "/estimates/estimate-1",
      lifecycleLabel: "Estimate",
      statusKey: "waiting_for_parts",
      statusLabel: "Waiting For Parts",
      title: "Estimate EST-06A7D9326B",
    });
  });

  it("does not label cancelled work orders as active", () => {
    const presentation = customerServiceHistoryPresentation({
      id: "work-order-1",
      custom_id: "000010",
      status: "cancelled",
      record_type: "work_order",
      estimate_number: null,
      estimate_status: null,
    });

    expect(presentation).toMatchObject({
      href: "/work-orders/work-order-1",
      lifecycleLabel: "Closed",
      statusKey: "cancelled",
      statusLabel: "Cancelled",
      title: "WO-000010",
    });
    expect(presentation.lifecycleLabel).not.toBe("Active");
  });

  it("keeps converted estimates classified as canonical work orders", () => {
    expect(
      customerServiceHistoryPresentation({
        id: "converted-1",
        custom_id: "001234",
        status: "in_progress",
        record_type: "work_order",
        estimate_number: "EST-LEGACY",
        estimate_status: "approved",
      }),
    ).toEqual({
      href: "/work-orders/converted-1",
      lifecycleLabel: "In progress",
      statusKey: "in_progress",
      statusLabel: "In Progress",
      title: "WO-001234",
    });
  });
});
