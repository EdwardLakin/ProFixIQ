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
): Promise<FleetVehicleBillingOwnerResolution> {
  const response = await fetchImpl(
    `/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/billing-owner?fleetId=${encodeURIComponent(fleetId)}`,
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

/** Realigns vehicles.customer_id to fleetId's billing account. */
export async function applyFleetVehicleBillingOwner(
  vehicleId: string,
  fleetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FleetVehicleBillingOwnerResolution> {
  return callBillingOwnerRoute(vehicleId, fleetId, "POST", fetchImpl);
}
