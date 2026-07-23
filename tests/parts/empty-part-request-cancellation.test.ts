import { describe, expect, it } from "vitest";
import { isDismissibleEmptyPartRequestBucket } from "../../features/parts/lib/requests/empty-request";

describe("empty parts request cancellation", () => {
  it("allows one or more requested records with no items to be dismissed", () => {
    expect(
      isDismissibleEmptyPartRequestBucket([
        { status: "requested", itemCount: 0 },
        { status: "requested", itemCount: 0 },
      ]),
    ).toBe(true);
  });

  it("does not treat a partially built request as abandoned", () => {
    expect(
      isDismissibleEmptyPartRequestBucket([
        { status: "requested", itemCount: 0 },
        { status: "requested", itemCount: 1 },
      ]),
    ).toBe(false);
  });

  it.each(["quoted", "approved", "fulfilled", "cancelled"])(
    "does not offer dismissal after the request reaches %s",
    (status) => {
      expect(
        isDismissibleEmptyPartRequestBucket([{ status, itemCount: 0 }]),
      ).toBe(false);
    },
  );

  it("does not offer dismissal for an empty card model", () => {
    expect(isDismissibleEmptyPartRequestBucket([])).toBe(false);
  });
});
