import { describe, expect, it } from "vitest";

import { calculateOrderCoverage } from "./order-quantity";

describe("calculateOrderCoverage", () => {
  it("orders the full approved quantity when no stock or PO coverage exists", () => {
    expect(calculateOrderCoverage({ qtyApproved: 3 }).remainingToOrderQty).toBe(3);
  });

  it("subtracts pre-existing staged stock from the order shortage", () => {
    expect(calculateOrderCoverage({ qtyApproved: 3, qtyReserved: 1 }).remainingToOrderQty).toBe(2);
  });

  it("does not double-count a received unit that was subsequently staged", () => {
    expect(calculateOrderCoverage({
      qtyApproved: 2,
      qtyOrdered: 1,
      qtyReceived: 1,
      qtyReserved: 1,
    }).remainingToOrderQty).toBe(1);
  });

  it("combines PO coverage with stock that predates the receipt", () => {
    expect(calculateOrderCoverage({
      qtyApproved: 2,
      qtyOrdered: 1,
      qtyReceived: 1,
      qtyReserved: 2,
    }).remainingToOrderQty).toBe(0);
  });

  it("keeps consumed stock as coverage after its reservation is issued", () => {
    expect(calculateOrderCoverage({
      qtyApproved: 2,
      qtyOrdered: 1,
      qtyConsumed: 1,
    }).remainingToOrderQty).toBe(0);
  });

  it("removes returned consumption from staged coverage", () => {
    expect(calculateOrderCoverage({
      qtyApproved: 2,
      qtyOrdered: 1,
      qtyConsumed: 1,
      qtyReturned: 1,
    }).remainingToOrderQty).toBe(1);
  });

  it("uses the largest legacy target field and clamps invalid values", () => {
    expect(calculateOrderCoverage({
      qty: 4,
      qtyRequested: 3,
      qtyApproved: 0,
      qtyOrdered: "bad",
      qtyReserved: -2,
    })).toMatchObject({
      targetQty: 4,
      remainingToOrderQty: 4,
    });
  });
});
