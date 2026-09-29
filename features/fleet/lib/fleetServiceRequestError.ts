type FleetServiceRequestError = {
  code?: string | null;
  message?: string | null;
};

export type FleetServiceRequestFailureReason =
  | "ownership_conflict"
  | "handoff_unavailable"
  | "not_found"
  | "replay_conflict"
  | "billing_unavailable"
  | "vehicle_unavailable"
  | "enrollment_missing"
  | "enrollment_ambiguous"
  | "unexpected";

export type FleetServiceRequestFailure = {
  error: string;
  status: number;
  reason: FleetServiceRequestFailureReason;
};

const OWNERSHIP_CONFLICT =
  "This unit's billing ownership must be reviewed before service can continue.";

export function mapFleetServiceRequestError(
  value: FleetServiceRequestError | null | undefined,
  fallback: string,
): FleetServiceRequestFailure {
  const message = value?.message ?? "";
  const code = value?.code?.trim() ?? "";

  if (
    code === "P0002" ||
    /fleet service request is unavailable/i.test(message)
  ) {
    return {
      error: "Fleet service request not found.",
      status: 404,
      reason: "not_found",
    };
  }

  if (
    /PFX_(?:FLEET_UNIT_OWNERSHIP|WORK_ORDER_CUSTOMER_VEHICLE)_MISMATCH/i.test(
      message,
    ) ||
    /work_order\s+.+customer_id\s+.+does not match vehicle\s+.+customer_id/i.test(
      message,
    )
  ) {
    return {
      error: OWNERSHIP_CONFLICT,
      status: 409,
      reason: "ownership_conflict",
    };
  }

  if (
    /PFX_FLEET_HANDOFF_UNAVAILABLE/i.test(message) ||
    /PFX_FLEET_REQUEST_SCOPE_MISMATCH/i.test(message)
  ) {
    return {
      error: OWNERSHIP_CONFLICT,
      status: 409,
      reason: "handoff_unavailable",
    };
  }

  if (/operation key.*different.*payload/i.test(message)) {
    return {
      error:
        "This request was already submitted with different details. Refresh and try again.",
      status: 409,
      reason: "replay_conflict",
    };
  }

  if (/service request not found/i.test(message)) {
    return {
      error: "Service request not found.",
      status: 404,
      reason: "not_found",
    };
  }

  if (/fleet billing account is unavailable/i.test(message)) {
    return {
      error: "This Fleet billing account must be configured before Shop intake.",
      status: 409,
      reason: "billing_unavailable",
    };
  }

  if (
    /PFX_WORK_ORDER_VEHICLE_NOT_FOUND/i.test(message) ||
    /PFX_FLEET_VEHICLE_UNAVAILABLE/i.test(message)
  ) {
    return {
      error: "The vehicle linked to this service request is no longer available.",
      status: 409,
      reason: "vehicle_unavailable",
    };
  }

  if (/PFX_FLEET_VEHICLE_ENROLLMENT_MISSING/i.test(message)) {
    return {
      error:
        "This unit isn't actively enrolled in a Fleet, so its billing owner can't be resolved automatically. Add it to a Fleet first.",
      status: 409,
      reason: "enrollment_missing",
    };
  }

  if (/PFX_FLEET_VEHICLE_ENROLLMENT_AMBIGUOUS/i.test(message)) {
    return {
      error:
        "This unit is actively enrolled in more than one Fleet, so its billing owner can't be resolved automatically. Fix the duplicate enrollment first.",
      status: 409,
      reason: "enrollment_ambiguous",
    };
  }

  return { error: fallback, status: 500, reason: "unexpected" };
}
