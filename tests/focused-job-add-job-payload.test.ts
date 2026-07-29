import { describe, expect, it } from "vitest";

import { buildAddJobLinePayload } from "@/features/work-orders/lib/addJobLinePayload";

describe("focused-job add-job payload", () => {
  it("uses only the canonical work-order-line approval fields", () => {
    const payload = buildAddJobLinePayload({
      id: "line-1",
      workOrderId: "work-order-1",
      vehicleId: "vehicle-1",
      jobName: " Replace left rear wheel speed sensor ",
      notes: " Verify wiring first ",
      laborHours: 1,
      parts: [{ description: "left rear wheel speed sensor", qty: 1 }],
      shopId: "shop-1",
      userId: "user-1",
      assignedTechId: "tech-1",
      urgency: "medium",
    });

    expect(payload).toMatchObject({
      id: "line-1",
      work_order_id: "work-order-1",
      vehicle_id: "vehicle-1",
      complaint: "Replace left rear wheel speed sensor",
      correction: "Verify wiring first",
      labor_time: 1,
      parts: "1x left rear wheel speed sensor",
      status: "awaiting_approval",
      approval_state: "pending",
      job_type: "repair",
      shop_id: "shop-1",
      user_id: "user-1",
      assigned_tech_id: "tech-1",
      urgency: "medium",
    });
    expect(payload).not.toHaveProperty("approval_decision");
    expect(payload).not.toHaveProperty("approval_requested_at");
  });

  it("omits optional actor fields and normalizes empty values", () => {
    const payload = buildAddJobLinePayload({
      id: "line-2",
      workOrderId: "work-order-2",
      vehicleId: null,
      jobName: "Diagnosis",
      notes: "   ",
      laborHours: 0,
      parts: [],
      shopId: "shop-2",
      userId: null,
      assignedTechId: null,
      urgency: "low",
    });

    expect(payload.correction).toBeNull();
    expect(payload.labor_time).toBeNull();
    expect(payload.parts).toBeNull();
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("assigned_tech_id");
  });
});
