import { describe, expect, it } from "vitest";

import {
  countActiveWorkOrderLines,
  formatWorkOrderHeaderStatus,
  shouldUseReadOnlyWorkOrderView,
} from "./workOrderPresentation";

describe("work-order presentation", () => {
  it("keeps financial readiness distinct from generic completion", () => {
    expect(formatWorkOrderHeaderStatus("ready_to_invoice").label).toBe(
      "Ready to invoice",
    );
    expect(formatWorkOrderHeaderStatus("invoiced").label).toBe("Invoiced");
    expect(formatWorkOrderHeaderStatus("invoiced", "paid").label).toBe("Paid");
    expect(formatWorkOrderHeaderStatus("completed").label).toBe("Completed");
  });

  it("counts only nonterminal job lines as active", () => {
    expect(
      countActiveWorkOrderLines([
        { status: "active" },
        { status: "waiting_parts" },
        { status: "completed" },
        { status: "ready_to_invoice" },
        { status: "invoiced" },
        { status: "declined" },
        { status: "deferred" },
      ]),
    ).toBe(2);
  });

  it("routes paid work orders to the immutable service view", () => {
    expect(shouldUseReadOnlyWorkOrderView("paid")).toBe(true);
    expect(shouldUseReadOnlyWorkOrderView("unpaid")).toBe(false);
    expect(shouldUseReadOnlyWorkOrderView(null)).toBe(false);
  });
});
