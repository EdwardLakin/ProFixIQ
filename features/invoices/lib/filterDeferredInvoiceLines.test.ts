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
});
