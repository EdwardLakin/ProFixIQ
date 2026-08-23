type FleetServiceRequestError = {
  message?: string | null;
};

export type FleetServiceRequestFailure = {
  error: string;
  status: number;
};

const OWNERSHIP_CONFLICT =
  "This unit's billing ownership must be reviewed before service can continue.";

export function mapFleetServiceRequestError(
  value: FleetServiceRequestError | null | undefined,
  fallback: string,
): FleetServiceRequestFailure {
  const message = value?.message ?? "";

  if (
    /PFX_(?:FLEET_(?:UNIT_OWNERSHIP|REQUEST_SCOPE)|WORK_ORDER_CUSTOMER_VEHICLE)_MISMATCH/i.test(
      message,
    ) ||
    /work_order\s+.+customer_id\s+.+does not match vehicle\s+.+customer_id/i.test(
      message,
    )
  ) {
    return { error: OWNERSHIP_CONFLICT, status: 409 };
  }

  if (/operation key.*different.*payload/i.test(message)) {
    return {
      error:
        "This request was already submitted with different details. Refresh and try again.",
      status: 409,
    };
  }

  if (/service request not found/i.test(message)) {
    return { error: "Service request not found.", status: 404 };
  }

  if (/fleet billing account is unavailable/i.test(message)) {
    return {
      error: "This Fleet billing account must be configured before Shop intake.",
      status: 409,
    };
  }

  if (/PFX_WORK_ORDER_VEHICLE_NOT_FOUND/i.test(message)) {
    return {
      error: "The vehicle linked to this service request is no longer available.",
      status: 409,
    };
  }

  return { error: fallback, status: 500 };
}
