import type {
  FleetServiceRequestFailure,
  FleetServiceRequestFailureReason,
} from "@/features/fleet/lib/fleetServiceRequestError";

/**
 * Why a Fleet service request can't be accepted into Shop, as reported by
 * diagnose_fleet_service_request_handoff. The conversion RPC raises one
 * PFX_FLEET_HANDOFF_UNAVAILABLE for all of these, so the cause has to be
 * established separately before the UI decides what recovery to offer.
 */
export type FleetHandoffCause =
  | "ownership_mismatch"
  | "enrollment_missing"
  | "billing_unavailable"
  | "lines_invalid"
  | "vehicle_unavailable"
  | "already_converted"
  | "ready";

export type FleetHandoffDiagnosis = {
  cause: FleetHandoffCause;
  vehicleId: string | null;
  unitLabel: string | null;
  fleetId: string | null;
  fleetName: string | null;
  vehicleCustomerId: string | null;
  vehicleCustomerName: string | null;
  fleetCustomerId: string | null;
  fleetCustomerName: string | null;
};

export type DiagnosisRow = {
  cause: string;
  vehicle_id: string | null;
  unit_label: string | null;
  fleet_id: string | null;
  fleet_name: string | null;
  vehicle_customer_id: string | null;
  vehicle_customer_name: string | null;
  fleet_customer_id: string | null;
  fleet_customer_name: string | null;
};

const CAUSES: readonly FleetHandoffCause[] = [
  "ownership_mismatch",
  "enrollment_missing",
  "billing_unavailable",
  "lines_invalid",
  "vehicle_unavailable",
  "already_converted",
  "ready",
];

export function parseDiagnosisRow(value: unknown): FleetHandoffDiagnosis | null {
  if (!Array.isArray(value)) return null;
  const row = value[0] as Partial<DiagnosisRow> | undefined;
  if (
    !row ||
    typeof row.cause !== "string" ||
    !CAUSES.includes(row.cause as FleetHandoffCause)
  ) {
    return null;
  }
  return {
    cause: row.cause as FleetHandoffCause,
    vehicleId: row.vehicle_id ?? null,
    unitLabel: row.unit_label ?? null,
    fleetId: row.fleet_id ?? null,
    fleetName: row.fleet_name ?? null,
    vehicleCustomerId: row.vehicle_customer_id ?? null,
    vehicleCustomerName: row.vehicle_customer_name ?? null,
    fleetCustomerId: row.fleet_customer_id ?? null,
    fleetCustomerName: row.fleet_customer_name ?? null,
  };
}

/** A customer row can exist with a null name; never render that as blank. */
export function describeAccount(
  name: string | null | undefined,
  id: string | null | undefined,
): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (id) return `Unnamed account (${id.slice(0, 8)})`;
  return "No account on file";
}

/** Failure reasons the billing-owner recovery is able to fix. */
export function isBillingOwnerRecoverable(
  reason: FleetServiceRequestFailureReason | null,
  diagnosis: FleetHandoffDiagnosis | null,
): boolean {
  if (diagnosis) return diagnosis.cause === "ownership_mismatch";
  // Diagnosis unavailable: keep the pre-existing recovery for the two
  // reasons that historically implied a billing-owner problem.
  return reason === "ownership_conflict" || reason === "handoff_unavailable";
}

/**
 * Replaces the generic handoff failure with the specific one the diagnosis
 * found. Returns the original failure when there is nothing more to say.
 */
export function refineHandoffFailure(
  failure: FleetServiceRequestFailure,
  diagnosis: FleetHandoffDiagnosis | null,
): FleetServiceRequestFailure {
  if (!diagnosis) return failure;
  const unit = diagnosis.unitLabel ?? "This unit";
  const fleet = diagnosis.fleetName ?? "the requesting Fleet";

  switch (diagnosis.cause) {
    case "ownership_mismatch":
      return {
        status: 409,
        reason: "ownership_conflict",
        error: `${unit} is billed to ${describeAccount(
          diagnosis.vehicleCustomerName,
          diagnosis.vehicleCustomerId,
        )} in Shop, but ${fleet} bills ${describeAccount(
          diagnosis.fleetCustomerName,
          diagnosis.fleetCustomerId,
        )}. Reassign the unit to the Fleet billing account, or correct the account, then accept again.`,
      };
    case "enrollment_missing":
      return {
        status: 409,
        reason: "enrollment_missing",
        error: `${unit} is not actively enrolled in ${fleet}. Re-enroll the unit in that Fleet before accepting this request.`,
      };
    case "billing_unavailable":
      return {
        status: 409,
        reason: "billing_unavailable",
        error: `${fleet} has no billing account. Link a customer account to the Fleet before accepting this request.`,
      };
    case "lines_invalid":
      return {
        status: 409,
        reason: "lines_invalid",
        error:
          "This request's service lines are missing or don't match its Fleet and unit. Billing ownership is not the problem; ask Fleet dispatch to resubmit the request.",
      };
    case "vehicle_unavailable":
      return {
        status: 409,
        reason: "vehicle_unavailable",
        error: "The vehicle linked to this service request is no longer available.",
      };
    case "already_converted":
      return {
        status: 409,
        reason: "stale_conflict",
        error: "This request was already accepted. Refresh to see its work order.",
      };
    case "ready":
      return {
        status: 409,
        reason: "stale_conflict",
        error:
          "Nothing is blocking this request any more. Try accepting it again.",
      };
  }
}
