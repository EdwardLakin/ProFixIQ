import type { FleetServiceRequestFailureReason } from "@/features/fleet/lib/fleetServiceRequestError";

export class FleetVehicleBillingOwnerError extends Error {
  readonly reason: FleetServiceRequestFailureReason | null;

  constructor(message: string, reason?: FleetServiceRequestFailureReason | null) {
    super(message);
    this.name = "FleetVehicleBillingOwnerError";
    this.reason = reason ?? null;
  }
}

export type FleetVehicleBillingOwnerResolution = {
  alreadyAligned: boolean;
  applied: boolean;
  vehicleId: string;
  fleetId: string;
  fleetName: string;
  previousCustomerId: string | null;
  previousCustomerName: string | null;
  resolvedCustomerId: string;
  resolvedCustomerName: string | null;
};

async function callBillingOwnerRoute(
  vehicleId: string,
  fleetId: string,
  method: "GET" | "POST",
  fetchImpl: typeof fetch,
  expected?: { previousCustomerId: string | null; resolvedCustomerId: string },
): Promise<FleetVehicleBillingOwnerResolution> {
  const params = new URLSearchParams({ fleetId });
  if (expected) {
    params.set("previousCustomerId", expected.previousCustomerId ?? "");
    params.set("resolvedCustomerId", expected.resolvedCustomerId);
  }
  const response = await fetchImpl(
    `/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/billing-owner?${params.toString()}`,
    { method },
  );
  const body = (await response.json().catch(() => ({}))) as Partial<
    FleetVehicleBillingOwnerResolution
  > & {
    error?: string;
    reason?: FleetServiceRequestFailureReason;
  };
  if (!response.ok || typeof body.resolvedCustomerId !== "string") {
    throw new FleetVehicleBillingOwnerError(
      body.error || "Unable to resolve this unit's billing owner",
      body.reason,
    );
  }
  return body as FleetVehicleBillingOwnerResolution;
}

/** Read-only preview: does not change vehicles.customer_id. */
export async function diagnoseFleetVehicleBillingOwner(
  vehicleId: string,
  fleetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FleetVehicleBillingOwnerResolution> {
  return callBillingOwnerRoute(vehicleId, fleetId, "GET", fetchImpl);
}

/**
 * Realigns vehicles.customer_id to fleetId's billing account. The expected
 * previous/resolved customer must be the values the caller just diagnosed,
 * so the RPC can reject a confirmation that no longer matches the current
 * state (see PFX_FLEET_BILLING_OWNER_STALE).
 */
export async function applyFleetVehicleBillingOwner(
  vehicleId: string,
  fleetId: string,
  expected: { previousCustomerId: string | null; resolvedCustomerId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FleetVehicleBillingOwnerResolution> {
  return callBillingOwnerRoute(vehicleId, fleetId, "POST", fetchImpl, expected);
}
