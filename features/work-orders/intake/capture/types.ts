// features/work-orders/intake/capture/types.ts
//
// Shared "capture" contract for document/vehicle scanning (VIN label,
// registration, etc). This is intentionally separate from `IntakeV1`
// (features/work-orders/intake/types.ts): a capture is untrusted OCR
// output that has not been reviewed yet, while `IntakeV1` only ever holds
// data that has already been resolved against a real customer/vehicle.
//
// See docs/audits/smart-intake-scanner-integration-audit-2026-07-22.md
// for the design this is based on.

export type IntakeCaptureSource = "vehicle_registration";

export type IntakeCaptureCustomerFields = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

export type IntakeCaptureVehicleFields = {
  vin?: string | null;
  /** Maps to `vehicles.license_plate` on apply. */
  plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  /** Maps to `vehicles.submodel` on apply. */
  trim?: string | null;
  engine?: string | null;
};

export type IntakeCaptureV1 = {
  version: "1.0";
  source: IntakeCaptureSource;
  capturedAt: string;
  customer: IntakeCaptureCustomerFields | null;
  vehicle: IntakeCaptureVehicleFields | null;
  /** Human-readable caveats to surface before the capture is applied. */
  warnings: string[];
};

export const CUSTOMER_CAPTURE_FIELDS: ReadonlyArray<
  keyof IntakeCaptureCustomerFields
> = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "address",
  "city",
  "province",
  "postal_code",
];

export const VEHICLE_CAPTURE_FIELDS: ReadonlyArray<
  keyof IntakeCaptureVehicleFields
> = ["vin", "plate", "year", "make", "model", "trim", "engine"];
