import { describe, expect, it } from "vitest";

import {
  earliestPartsRequestStage,
  toPartsRequestStage,
  type PartsRequestStageItem,
} from "./status-display";

const pricedItem: PartsRequestStageItem = {
  description: "Engine oil filter",
  partId: "part-1",
  quotedPrice: 18.5,
  qty: 1,
  qtyRequested: 1,
  qtyApproved: 0,
  qtyOrdered: 0,
  qtyReceived: 0,
  qtyReserved: 0,
  qtyConsumed: 0,
  qtyReturned: 0,
  rawStatus: "quoted",
};

describe("parts request operational stages", () => {
  it("keeps incomplete pricing in Needs Quote even when the line is pre-approved", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "approved",
        items: [{ ...pricedItem, partId: null }],
      }),
    ).toBe("needs_quote");
  });

  it("moves a fully priced unapproved request to Awaiting Approval", () => {
    expect(
      toPartsRequestStage({ rawStatus: "requested", items: [pricedItem] }),
    ).toBe("awaiting_approval");
    expect(
      toPartsRequestStage({ rawStatus: "quoted", items: [pricedItem] }),
    ).toBe("awaiting_approval");
  });

  it("releases approved work to Order & Receive without pretending it was ordered", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "approved",
        items: [{ ...pricedItem, qtyApproved: 1, rawStatus: "approved" }],
      }),
    ).toBe("order_receive");
  });

  it("requires staged stock before Ready for Tech", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "approved",
        items: [
          {
            ...pricedItem,
            qtyApproved: 1,
            qtyReserved: 1,
            rawStatus: "reserved",
          },
        ],
      }),
    ).toBe("ready_for_tech");
  });

  it("does not lose the legacy qty target when qty_requested is zero", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "approved",
        items: [
          {
            ...pricedItem,
            qty: 2,
            qtyRequested: 0,
            qtyApproved: 0,
            qtyReserved: 1,
          },
        ],
      }),
    ).toBe("order_receive");
  });

  it("uses physical handoff or a terminal parent state for Completed", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "approved",
        items: [
          {
            ...pricedItem,
            qtyApproved: 1,
            qtyConsumed: 1,
            rawStatus: "consumed",
          },
        ],
      }),
    ).toBe("completed");

    for (const rawStatus of [
      "fulfilled",
      "rejected",
      "deferred",
      "cancelled",
      "returned",
    ]) {
      expect(toPartsRequestStage({ rawStatus, items: [pricedItem] })).toBe(
        "completed",
      );
    }
  });

  it("places a mixed work order in its earliest actionable stage", () => {
    expect(
      earliestPartsRequestStage([
        "ready_for_tech",
        "order_receive",
        "awaiting_approval",
      ]),
    ).toBe("awaiting_approval");
  });
});
