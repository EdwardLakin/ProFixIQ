import { describe, expect, it } from "vitest";

import { filterDeferredInvoiceLines } from "./filterDeferredInvoiceLines";

describe("filterDeferredInvoiceLines", () => {
  it("excludes only deferred historical lines and strips internal status", () => {
    const result = filterDeferredInvoiceLines([
      { id: "deferred", status: "deferred", description: "old repair" },
      { id: "approved", status: "approved", description: "approved repair" },
      { id: "completed", status: "completed", description: "completed repair" },
      { id: "legacy", status: null, description: "legacy repair" },
    ]);

    expect(result).toEqual([
      { id: "approved", description: "approved repair" },
      { id: "completed", description: "completed repair" },
      { id: "legacy", description: "legacy repair" },
    ]);
  });

  it("normalizes status casing without suppressing any non-deferred state", () => {
    expect(
      filterDeferredInvoiceLines([
        { id: "one", status: " DEFERRED " },
        { id: "two", status: "declined" },
        { id: "three", status: "on_hold" },
      ]),
    ).toEqual([
      { id: "two" },
      { id: "three" },
    ]);
  });

  it("excludes lines deferred via line_status even when status is on_hold, and strips it", () => {
    // The shop-assistant decision path leaves status = 'on_hold' and sets
    // line_status = 'deferred', distinct from the carry-forward path's
    // status = 'deferred'. Both must exclude the line from invoicing.
    const result = filterDeferredInvoiceLines([
      {
        id: "assistant-deferred",
        status: "on_hold",
        line_status: "deferred",
        description: "shop-assistant deferred repair",
      },
      {
        id: "carry-forward-deferred",
        status: "deferred",
        line_status: null,
        description: "carry-forward deferred repair",
      },
      {
        id: "active",
        status: "on_hold",
        line_status: "pending",
        description: "active on-hold repair",
      },
    ]);

    expect(result).toEqual([
      { id: "active", description: "active on-hold repair" },
    ]);
  });
});
