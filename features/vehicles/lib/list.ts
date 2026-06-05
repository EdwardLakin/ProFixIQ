import { formatVehicleDisplayLabel, normalizeVehicleText } from "@/features/vehicles/lib/display";
import type { Database } from "@shared/types/types/supabase";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];

export type VehicleListRow = Pick<Vehicle, "id" | "external_id" | "unit_number" | "year" | "make" | "model" | "submodel" | "vin" | "license_plate" | "customer_id" | "mileage" | "engine_hours" | "engine" | "fuel_type" | "import_notes" | "source_row_id"> & {
  customers?: Pick<Customer, "id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number"> | null;
};

export function vehicleCustomerName(customer: VehicleListRow["customers"]): string | null {
  if (!customer) return null;
  return (
    customer.business_name?.trim() ||
    customer.name?.trim() ||
    [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim() ||
    customer.email ||
    customer.phone ||
    customer.phone_number ||
    null
  );
}

function searchText(row: VehicleListRow): string {
  return [
    row.vin,
    row.unit_number,
    row.license_plate,
    row.year != null ? String(row.year) : null,
    row.make,
    row.model,
    vehicleCustomerName(row.customers),
    row.external_id,
    formatVehicleDisplayLabel(row),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortKey(row: VehicleListRow): string {
  return (normalizeVehicleText(row.unit_number) || formatVehicleDisplayLabel(row) || row.external_id || row.id).toLowerCase();
}

export function filterSortAndCapVehicles(rows: VehicleListRow[], query: string, limit = 20): VehicleListRow[] {
  const normalizedQuery = query.trim().toLowerCase();
  return rows
    .filter((row) => !normalizedQuery || searchText(row).includes(normalizedQuery))
    .sort((a, b) => {
      const byPrimary = sortKey(a).localeCompare(sortKey(b), undefined, { numeric: true, sensitivity: "base" });
      if (byPrimary !== 0) return byPrimary;
      const byLabel = formatVehicleDisplayLabel(a).localeCompare(formatVehicleDisplayLabel(b), undefined, { numeric: true, sensitivity: "base" });
      if (byLabel !== 0) return byLabel;
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}
