export type AppointmentCustomerSearchResult = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountType: string | null;
};

export type AppointmentVehicleSearchResult = {
  id: string;
  customerId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  licensePlate: string | null;
  unitNumber: string | null;
  label: string;
};

export type AppointmentCustomerVehicleSearchGroup = {
  customer: AppointmentCustomerSearchResult;
  vehicles: AppointmentVehicleSearchResult[];
  matchedCustomer: boolean;
  matchedVehicleIds: string[];
};

export type AppointmentCustomerVehicleSearchResponse = {
  query: string;
  groups: AppointmentCustomerVehicleSearchGroup[];
};

export function appointmentVehicleLabel(
  vehicle: Pick<
    AppointmentVehicleSearchResult,
    "year" | "make" | "model" | "vin" | "licensePlate" | "unitNumber"
  >,
): string {
  const description = [vehicle.year, vehicle.make, vehicle.model]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .join(" ")
    .trim();
  const identity =
    vehicle.unitNumber?.trim() ||
    vehicle.licensePlate?.trim() ||
    (vehicle.vin?.trim() ? vehicle.vin.trim().slice(-8) : "");

  if (description && identity) return `${description} · ${identity}`;
  return description || identity || "Vehicle";
}
