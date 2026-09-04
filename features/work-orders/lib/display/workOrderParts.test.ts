import { describe, expect, it } from "vitest";
import {
  getCanonicalPartQuantity,
  summarizeCanonicalPartAllocations,
} from "./workOrderParts";

describe("getCanonicalPartQuantity", () => {
  it("prefers the stable quantity column over quantity_requested", () => {
    // WO-000018's exact live shape: quantity_requested drifted to 0 while
    // quantity (the line's real need) stayed correct.
    expect(getCanonicalPartQuantity({ quantity: 6, quantity_requested: 0 })).toBe(6);
    expect(getCanonicalPartQuantity({ quantity: 1, quantity_requested: 0 })).toBe(1);
  });

  it("falls back to quantity_requested only when quantity is missing", () => {
    expect(getCanonicalPartQuantity({ quantity: null as unknown as number, quantity_requested: 4 })).toBe(4);
  });
});

describe("summarizeCanonicalPartAllocations", () => {
  it("counts a fully consumed part as fulfilled even with no live allocation row", () => {
    // parts_issue_work_order_part deletes the work_order_part_allocations
    // row once the full allocated quantity is issued/consumed -- a part
    // that's actually installed on the vehicle must not read as "required"
    // just because nothing is left sitting in a "picked" state.
    const part = {
      id: "wop-1",
      source_parts_request_item_id: "item-1",
      quantity_consumed: 6,
      quantity_received: 0,
    };
    const result = summarizeCanonicalPartAllocations(part, []);
    expect(result.allocatedQuantity).toBe(6);
    expect(result.locations).toEqual([]);
  });

  it("adds consumed/received quantity on top of any still-live allocation", () => {
    const part = {
      id: "wop-1",
      source_parts_request_item_id: "item-1",
      quantity_consumed: 2,
      quantity_received: 1,
    };
    const allocations = [{ work_order_part_id: "wop-1", location_id: "loc-a", qty: 3 }];
    const result = summarizeCanonicalPartAllocations(part, allocations);
    expect(result.allocatedQuantity).toBe(6);
    expect(result.locations).toEqual(["loc-a"]);
  });

  it("still reports 0 for a part with nothing picked, received, or consumed", () => {
    const part = { id: "wop-1", source_parts_request_item_id: "item-1" };
    const result = summarizeCanonicalPartAllocations(part, []);
    expect(result.allocatedQuantity).toBe(0);
  });
});
