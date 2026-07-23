import { describe, expect, it } from "vitest";
import { isDismissibleEmptyPartRequestBucket } from "../../features/parts/lib/requests/empty-request";

describe("empty parts request cancellation", () => {
  it("allows empty pre-operational request states to be dismissed together", () => {
    expect(
      isDismissibleEmptyPartRequestBucket([
        { status: "requested", itemCount: 0 },
        { status: "quoted", itemCount: 0 },
        { status: "approved", itemCount: 0 },
      ]),
    ).toBe(true);
  });

  it("does not treat a partially built request as abandoned", () => {
    expect(
      isDismissibleEmptyPartRequestBucket([
        { status: "requested", itemCount: 0 },
        { status: "quoted", itemCount: 1 },
      ]),
    ).toBe(false);
  });

  it.each([
    "partially_ordered",
    "partially_consumed",
    "partially_returned",
    "returned",
    "fulfilled",
    "rejected",
    "deferred",
    "cancelled",
  ])("does not offer dismissal after the request reaches %s", (status) => {
    expect(
      isDismissibleEmptyPartRequestBucket([{ status, itemCount: 0 }]),
    ).toBe(false);
  });

  it("does not offer dismissal for an empty card model", () => {
    expect(isDismissibleEmptyPartRequestBucket([])).toBe(false);
  });
});
