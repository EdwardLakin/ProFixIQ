// features/work-orders/intake/capture/scanRegistration.ts
"use client";

import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";
import {
  CUSTOMER_CAPTURE_FIELDS,
  VEHICLE_CAPTURE_FIELDS,
  type IntakeCaptureV1,
} from "./types";

type RawRegistrationFields = {
  vin?: string | null;
  plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
};

type RegistrationOcrResponse = {
  fields?: RawRegistrationFields | null;
  error?: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function hasAnyValue(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
}

/**
 * Scans a photo of a vehicle registration (or insurance card) and returns
 * an untrusted `IntakeCaptureV1`. This calls the existing vision-backed
 * `/api/ocr/registration` route directly as multipart form data — no
 * separate storage upload is needed just to run OCR.
 *
 * The result is NOT applied to any customer/vehicle record. Callers must
 * route it through a review step before writing anything.
 */
export async function scanVehicleRegistration(
  file: File,
): Promise<IntakeCaptureV1> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That image is too large. Please use a photo under 8 MB.");
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const res = await fetch("/api/ocr/registration", {
    method: "POST",
    body: formData,
  });

  const body = (await res.json().catch(() => null)) as
    | RegistrationOcrResponse
    | null;

  if (!res.ok || !body || body.error) {
    throw new Error(
      body?.error || `Could not read that document (HTTP ${res.status}).`,
    );
  }

  const raw = body.fields ?? {};
  const warnings: string[] = [];

  const normalizedVin = raw.vin ? normalizeVinInput(raw.vin) : null;
  if (raw.vin && normalizedVin && !normalizedVin.isValid) {
    warnings.push(
      "The VIN on the document didn't pass validation — double-check it before saving.",
    );
  }

  const vehicle: IntakeCaptureV1["vehicle"] = {
    vin: normalizedVin?.isValid ? normalizedVin.vin : (raw.vin ?? null),
    plate: raw.plate ?? null,
    year: raw.year ?? null,
    make: raw.make ?? null,
    model: raw.model ?? null,
    trim: raw.trim ?? null,
    engine: raw.engine ?? null,
  };

  const customer: IntakeCaptureV1["customer"] = {
    first_name: raw.first_name ?? null,
    last_name: raw.last_name ?? null,
    phone: raw.phone ?? null,
    email: raw.email ?? null,
    address: raw.address ?? null,
    city: raw.city ?? null,
    province: raw.province ?? null,
    postal_code: raw.postal_code ?? null,
  };

  const vehicleHasData =
    vehicle !== null &&
    VEHICLE_CAPTURE_FIELDS.some((key) => Boolean(vehicle?.[key]));
  const customerHasData =
    customer !== null &&
    CUSTOMER_CAPTURE_FIELDS.some((key) => Boolean(customer?.[key]));

  if (!vehicleHasData && !customerHasData) {
    warnings.push(
      "No readable fields were found on that photo. Try a clearer, well-lit shot or enter the details manually.",
    );
  }

  return {
    version: "1.0",
    source: "vehicle_registration",
    capturedAt: new Date().toISOString(),
    customer: customerHasData ? customer : null,
    vehicle: vehicleHasData ? vehicle : null,
    warnings,
  };
}

// Re-exported for callers that only want a quick truthiness check without
// importing the field-name constants directly.
export function captureHasAnyData(capture: IntakeCaptureV1): boolean {
  return (
    hasAnyValue(capture.customer ?? {}) || hasAnyValue(capture.vehicle ?? {})
  );
}
