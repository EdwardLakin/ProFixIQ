// features/work-orders/intake/capture/resolveVehicleCaptureMatch.ts
"use client";

import { checkVehicleDuplicates } from "@/features/shared/lib/vehicles/duplicateCheck";
import type { IntakeCaptureVehicleFields } from "./types";

export type CaptureMatchPreview =
  | { kind: "none" }
  | { kind: "same_customer"; label: string; vehicleId: string }
  | { kind: "different_customer"; label: string };

function describeMatch(match: {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
}): string {
  const ymm = [match.year, match.make, match.model].filter(Boolean).join(" ");
  return ymm || match.vin || match.license_plate || "this vehicle";
}

/**
 * Best-effort, informational preview of whether a scanned VIN/plate matches
 * a vehicle already on file, shown before the capture is applied. This is
 * NOT the authoritative duplicate check — `ensureVehicleRow` in the create
 * work order page re-checks and enforces the same-customer/cross-customer
 * rules at save time regardless of what this preview says.
 */
export async function previewVehicleCaptureMatch(params: {
  vehicle: IntakeCaptureVehicleFields;
  customerId: string | null;
  vehicleId: string | null;
}): Promise<CaptureMatchPreview> {
  if (!params.vehicle.vin && !params.vehicle.plate) return { kind: "none" };

  try {
    const result = await checkVehicleDuplicates({
      vin: params.vehicle.vin,
      licensePlate: params.vehicle.plate,
      customerId: params.customerId,
      vehicleId: params.vehicleId,
    });

    const differentCustomer = result.matches.find(
      (m) => m.same_customer === false,
    );
    if (differentCustomer) {
      return {
        kind: "different_customer",
        label: `${describeMatch(differentCustomer)} (linked to ${
          differentCustomer.customer_display_name ?? "another customer"
        })`,
      };
    }

    const sameCustomer = result.matches.find((m) => m.same_customer === true);
    if (sameCustomer) {
      return {
        kind: "same_customer",
        label: describeMatch(sameCustomer),
        vehicleId: sameCustomer.id,
      };
    }

    return { kind: "none" };
  } catch {
    // The preview is informational only; a failure here must never block
    // the review/apply flow.
    return { kind: "none" };
  }
}
