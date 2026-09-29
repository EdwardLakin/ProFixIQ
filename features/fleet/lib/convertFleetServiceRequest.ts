import type { FleetHandoffDiagnosis } from "@/features/fleet/lib/fleetHandoffDiagnosis";
import type { FleetServiceRequestFailureReason } from "@/features/fleet/lib/fleetServiceRequestError";

export class FleetServiceRequestConversionError extends Error {
  readonly reason: FleetServiceRequestFailureReason | null;
  readonly diagnosis: FleetHandoffDiagnosis | null;

  constructor(
    message: string,
    reason?: FleetServiceRequestFailureReason | null,
    diagnosis?: FleetHandoffDiagnosis | null,
  ) {
    super(message);
    this.name = "FleetServiceRequestConversionError";
    this.reason = reason ?? null;
    this.diagnosis = diagnosis ?? null;
  }
}

export async function convertFleetServiceRequest(
  serviceRequestId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(
    "/api/fleet/service-requests/convert-to-work-order",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceRequestId }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    workOrderId?: string;
    error?: string;
    reason?: FleetServiceRequestFailureReason;
    diagnosis?: FleetHandoffDiagnosis;
  };
  if (!response.ok || !body.workOrderId) {
    throw new FleetServiceRequestConversionError(
      body.error || "Unable to create work order",
      body.reason,
      body.diagnosis,
    );
  }
  return body.workOrderId;
}
