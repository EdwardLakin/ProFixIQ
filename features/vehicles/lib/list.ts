import { formatVehicleDisplayLabel, normalizeVehicleText } from "@/features/vehicles/lib/display";
import type { Database } from "@shared/types/types/supabase";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];

export type VehicleListRow = Pick<Vehicle, "id" | "external_id" | "unit_number" | "year" | "make" | "model" | "submodel" | "vin" | "license_plate" | "customer_id" | "mileage" | "engine_hours" | "engine" | "fuel_type" | "import_notes" | "source_row_id"> & {
  customers?: Pick<Customer, "id" | "external_id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number"> | null;
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
    row.customers?.external_id,
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

const VEHICLE_DIRECTORY_PAGE_SIZE = 1000;
const VEHICLE_DIRECTORY_SELECT = "id, external_id, unit_number, year, make, model, submodel, vin, license_plate, customer_id, mileage, engine_hours, engine, fuel_type, import_notes, source_row_id";
const VEHICLE_DIRECTORY_CUSTOMER_SELECT = "id, external_id, business_name, name, first_name, last_name, email, phone, phone_number";

type VehicleDirectoryClient = {
  from: (table: string) => any;
};

async function fetchPagedRows<T>(baseQuery: any): Promise<{ rows: T[]; error: unknown | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += VEHICLE_DIRECTORY_PAGE_SIZE) {
    const to = from + VEHICLE_DIRECTORY_PAGE_SIZE - 1;
    const { data, error } = await baseQuery.range(from, to);
    if (error) return { rows, error };
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < VEHICLE_DIRECTORY_PAGE_SIZE) return { rows, error: null };
  }
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export async function fetchVehicleDirectoryRows(supabase: VehicleDirectoryClient, shopId: string): Promise<{ rows: VehicleListRow[]; error: unknown | null }> {
  const vehiclesResult = await fetchPagedRows<Omit<VehicleListRow, "customers">>(
    supabase
      .from("vehicles")
      .select(VEHICLE_DIRECTORY_SELECT)
      .eq("shop_id", shopId)
      .order("unit_number", { ascending: true, nullsFirst: false })
      .order("make", { ascending: true, nullsFirst: false })
      .order("model", { ascending: true, nullsFirst: false })
      .order("external_id", { ascending: true, nullsFirst: false }),
  );

  const vehicles = vehiclesResult.rows;
  const customerIds = uniqueNonEmpty(vehicles.map((row) => row.customer_id));
  const customersById = new Map<string, VehicleListRow["customers"]>();

  for (let index = 0; index < customerIds.length; index += VEHICLE_DIRECTORY_PAGE_SIZE) {
    const ids = customerIds.slice(index, index + VEHICLE_DIRECTORY_PAGE_SIZE);
    const { data, error } = await supabase
      .from("customers")
      .select(VEHICLE_DIRECTORY_CUSTOMER_SELECT)
      .eq("shop_id", shopId)
      .in("id", ids);

    if (error) continue;
    for (const customer of (data ?? []) as NonNullable<VehicleListRow["customers"]>[]) {
      customersById.set(customer.id, customer);
    }
  }

  return {
    rows: vehicles.map((row) => ({ ...row, customers: row.customer_id ? customersById.get(row.customer_id) ?? null : null })),
    error: vehiclesResult.error,
  };
}
