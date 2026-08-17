import { describe, expect, it } from "vitest";

import { deriveAssistantContext } from "@/features/assistant/lib/deriveAssistantContext";

const WORK_ORDER_ID = "6df0b00e-b19d-4b0a-9e5f-09dd1e58e616";
const VEHICLE_ID = "afaeab32-5a6c-470e-9514-823fb303d9c3";

describe("global assistant route context", () => {
  it.each([
    "/work-orders/view",
    "/work-orders/board",
    "/work-orders/quote-review",
    "/work-orders/history",
    `/work-orders/history/${WORK_ORDER_ID}`,
  ])(
    "does not mistake a reserved or history route for a work-order id: %s",
    (path) => {
      const context = deriveAssistantContext(path);
      expect(context.workOrderId).toBeUndefined();
      expect(context.pageType).toBe("work_orders");
    },
  );

  it.each([
    `/work-orders/${WORK_ORDER_ID}`,
    `/work-orders/view/${WORK_ORDER_ID}`,
    `/work-orders/${WORK_ORDER_ID}/quote-review`,
    `/mobile/work-orders/${WORK_ORDER_ID}`,
  ])("binds real work-order detail routes: %s", (path) => {
    const context = deriveAssistantContext(path);
    expect(context.workOrderId).toBe(WORK_ORDER_ID);
    expect(context.pageType).toBe("work_order");
  });

  it("marks an invoice work-order route without losing its work-order id", () => {
    const context = deriveAssistantContext(
      `/work-orders/${WORK_ORDER_ID}/invoice`,
    );
    expect(context.workOrderId).toBe(WORK_ORDER_ID);
    expect(context.pageType).toBe("invoice");
  });

  it("binds a fleet unit detail as vehicle context", () => {
    const context = deriveAssistantContext(`/fleet/units/${VEHICLE_ID}`);
    expect(context.vehicleId).toBe(VEHICLE_ID);
    expect(context.pageType).toBe("vehicle");
  });

  it("preserves an explicit trusted query context on a list page", () => {
    const context = deriveAssistantContext(
      "/parts/inventory",
      new URLSearchParams({ workOrderId: WORK_ORDER_ID }),
    );
    expect(context.workOrderId).toBe(WORK_ORDER_ID);
    expect(context.pageType).toBe("inventory");
  });
});
