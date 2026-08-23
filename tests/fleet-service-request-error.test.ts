import { describe, expect, it } from "vitest";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";

describe("Fleet service-request error mapping", () => {
  it.each([
    "PFX_FLEET_UNIT_OWNERSHIP_MISMATCH",
    "PFX_FLEET_REQUEST_SCOPE_MISMATCH",
    "PFX_WORK_ORDER_CUSTOMER_VEHICLE_MISMATCH",
    "work_order 11111111-1111-4111-8111-111111111111 customer_id 22222222-2222-4222-8222-222222222222 does not match vehicle 33333333-3333-4333-8333-333333333333 customer_id 44444444-4444-4444-8444-444444444444",
  ])("sanitizes ownership conflicts without returning identifiers", (message) => {
    expect(
      mapFleetServiceRequestError(
        { message },
        "Failed to process this service request.",
      ),
    ).toEqual({
      error:
        "This unit's billing ownership must be reviewed before service can continue.",
      status: 409,
    });
  });

  it("sanitizes unexpected database errors", () => {
    expect(
      mapFleetServiceRequestError(
        { message: "relation private.secret_table does not exist" },
        "Failed to process this service request.",
      ),
    ).toEqual({
      error: "Failed to process this service request.",
      status: 500,
    });
  });

  it("keeps replay conflicts actionable without echoing database text", () => {
    expect(
      mapFleetServiceRequestError(
        {
          message:
            "Operation key was already used for a different Fleet request payload",
        },
        "Failed to process this service request.",
      ),
    ).toEqual({
      error:
        "This request was already submitted with different details. Refresh and try again.",
      status: 409,
    });
  });
});
