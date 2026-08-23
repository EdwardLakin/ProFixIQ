import { describe, expect, it } from "vitest";

import {
  earliestPartsRequestStage,
  canonicalPartQuantity,
  isMenuIntakeItemReviewed,
  summarizePartsRequestStages,
  summarizeRequestFlowDisplays,
  toCanonicalPartsStatus,
  toItemFlowDisplay,
  toMenuIntakeStage,
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
  it("counts canonical request states without relabeling in-progress as ordered", () => {
    expect(
      summarizeRequestFlowDisplays([
        "pending",
        "in_progress",
        "in_progress",
        "ready",
        "complete",
      ]),
    ).toEqual({
      pending: 1,
      in_progress: 2,
      ready: 1,
      complete: 1,
    });
  });

  it("accepts a priced manual part without an inventory link", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "quoted",
        items: [{ ...pricedItem, partId: null }],
      }),
    ).toBe("awaiting_approval");
  });

  it("keeps identity, quantity, or price gaps in Needs Quote", () => {
    for (const item of [
      { ...pricedItem, description: "", partId: null },
      { ...pricedItem, qty: 0, qtyRequested: 0 },
      { ...pricedItem, quotedPrice: null, unitPrice: null },
      { ...pricedItem, quotedPrice: -1 },
    ]) {
      expect(
        toPartsRequestStage({ rawStatus: "quoted", items: [item] }),
      ).toBe("needs_quote");
    }
  });

  it("accepts vendor identity when the description and catalog link are absent", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "quoted",
        items: [
          {
            ...pricedItem,
            description: "",
            partId: null,
            requestedPartNumber: "NAPA-123",
          },
        ],
      }),
    ).toBe("awaiting_approval");
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
    expect(
      toItemFlowDisplay({
        ...pricedItem,
        qtyApproved: 1,
        rawStatus: "approved",
      }),
    ).toBe("approved");
  });

  it("lets durable ordering progress override a stale requested parent status", () => {
    expect(
      toPartsRequestStage({
        rawStatus: "requested",
        items: [{ ...pricedItem, qtyOrdered: 1, rawStatus: "ordered" }],
      }),
    ).toBe("order_receive");
  });

  it("maps every persisted lifecycle state to the canonical contract", () => {
    expect(toCanonicalPartsStatus(pricedItem)).toBe("quoted");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, rawStatus: "awaiting_customer_approval" }),
    ).toBe("awaiting_approval");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, rawStatus: "approved", qtyApproved: 1 }),
    ).toBe("approved");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, rawStatus: "approved", qtyApproved: 1, qtyOrdered: 1 }),
    ).toBe("ordered");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, qtyApproved: 2, qtyReceived: 1 }),
    ).toBe("partially_received");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, qtyApproved: 2, qtyReceived: 2 }),
    ).toBe("received");
    expect(toCanonicalPartsStatus({ rawStatus: "received" })).toBe("received");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, qtyApproved: 2, qtyConsumed: 2 }),
    ).toBe("allocated");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, rawStatus: "partially_returned" }),
    ).toBe("partially_returned");
    expect(
      toCanonicalPartsStatus({ ...pricedItem, rawStatus: "returned" }),
    ).toBe("returned");
    expect(toCanonicalPartsStatus({ ...pricedItem, rawStatus: "rejected" })).toBe("declined");
    expect(toCanonicalPartsStatus({ ...pricedItem, rawStatus: "cancelled" })).toBe("cancelled");
  });

  it("uses the greatest durable quantity across quote, portal, and invoice aliases", () => {
    expect(canonicalPartQuantity({ qty: 1, qtyRequested: 3, qtyApproved: 2 })).toBe(3);
  });

  it("derives KPI counts from the same operational stage values", () => {
    expect(
      summarizePartsRequestStages([
        "needs_quote",
        "awaiting_approval",
        "awaiting_approval",
        "order_receive",
        "ready_for_tech",
        "completed",
      ]),
    ).toEqual({
      needs_quote: 1,
      awaiting_approval: 2,
      order_receive: 1,
      ready_for_tech: 1,
      completed: 1,
    });
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

  it("keeps service-menu intake aligned with its persisted review contract", () => {
    expect(
      isMenuIntakeItemReviewed({
        ...pricedItem,
        unitPrice: null,
        quotedPrice: 18.5,
      }),
    ).toBe(false);
    expect(
      toMenuIntakeStage({
        rawStatus: "requested",
        items: [{ ...pricedItem, unitPrice: 18.5 }],
      }),
    ).toBe("completed");
    expect(
      toMenuIntakeStage({
        rawStatus: "requested",
        items: [{ ...pricedItem, unitPrice: null, quotedPrice: 18.5 }],
      }),
    ).toBe("needs_quote");
  });
});
