import type { Database } from "@shared/types/types/supabase";

type VehicleLike = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "year" | "make" | "model" | "submodel" | "vin" | "license_plate" | "unit_number"
>;

export function normalizeVehicleText(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function normalizeVehicleIdentifier(value: string | null | undefined): string | null {
  return normalizeVehicleText(value)?.toUpperCase() ?? null;
}

export function formatVehicleYearMakeModel(vehicle: Pick<VehicleLike, "year" | "make" | "model"> & Partial<Pick<VehicleLike, "submodel">>): string {
  return [vehicle.year != null ? String(vehicle.year) : null, vehicle.make, vehicle.model, vehicle.submodel]
    .map((part) => normalizeVehicleText(part))
    .filter(Boolean)
    .join(" ") || "Vehicle";
}

export function formatVehicleIdentifier(vehicle: Pick<VehicleLike, "unit_number" | "vin" | "license_plate">): string {
  const unit = normalizeVehicleText(vehicle.unit_number);
  if (unit) return `Unit ${unit}`;
  const plate = normalizeVehicleIdentifier(vehicle.license_plate);
  if (plate) return `Plate ${plate}`;
  const vin = normalizeVehicleIdentifier(vehicle.vin);
  if (vin) return `VIN ${vin}`;
  return "No identifier";
}

export function formatVehicleDisplayLabel(vehicle: VehicleLike): string {
  const title = formatVehicleYearMakeModel(vehicle);
  const identifier = formatVehicleIdentifier(vehicle);
  return identifier === "No identifier" ? title : `${title} · ${identifier}`;
}
