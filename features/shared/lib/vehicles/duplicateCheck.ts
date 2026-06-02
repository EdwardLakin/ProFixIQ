export type VehicleDuplicateMatch = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  unit_number: string | null;
  customer_display_name: string | null;
  same_customer: boolean | null;
  match_type: "vin" | "license_plate" | "unit_number";
};

export type VehicleDuplicateCheckRequest = {
  vin?: string | null;
  licensePlate?: string | null;
  unitNumber?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
};

export type VehicleDuplicateCheckResponse = {
  matches: VehicleDuplicateMatch[];
  hasVinMatch: boolean;
  hasSameCustomerMatch: boolean;
  hasDifferentCustomerMatch: boolean;
};

export async function checkVehicleDuplicates(
  input: VehicleDuplicateCheckRequest,
): Promise<VehicleDuplicateCheckResponse> {
  const res = await fetch("/api/vehicles/duplicate-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await res.json().catch(() => ({}))) as Partial<VehicleDuplicateCheckResponse> & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(payload.error ?? "Failed to check for duplicate vehicles.");
  }

  return {
    matches: payload.matches ?? [],
    hasVinMatch: Boolean(payload.hasVinMatch),
    hasSameCustomerMatch: Boolean(payload.hasSameCustomerMatch),
    hasDifferentCustomerMatch: Boolean(payload.hasDifferentCustomerMatch),
  };
}
