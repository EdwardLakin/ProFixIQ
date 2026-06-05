import { formatVehicleDisplayLabel, normalizeVehicleText } from "@/features/vehicles/lib/display";
import type { Database } from "@shared/types/types/supabase";

type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];

type VehicleDirectoryVehicleRow = Pick<
  Vehicle,
  | "id"
  | "shop_id"
  | "customer_id"
  | "external_id"
  | "unit_number"
  | "vin"
  | "license_plate"
  | "year"
  | "make"
  | "model"
  | "submodel"
  | "mileage"
  | "engine_hours"
  | "engine"
  | "fuel_type"
  | "source_row_id"
  | "import_notes"
  | "created_at"
>;

type VehicleDirectoryCustomerRow = Pick<Customer, "id" | "external_id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number"> & {
  display_name?: string | null;
};

export type VehicleListRow = VehicleDirectoryVehicleRow & {
  customers?: VehicleDirectoryCustomerRow | null;
  customerName?: string | null;
  customerExternalId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

export function vehicleCustomerName(customer: VehicleListRow["customers"]): string | null {
  if (!customer) return null;
  return (
    customer.business_name?.trim() ||
    customer.name?.trim() ||
    customer.display_name?.trim() ||
    [customer.first_name ?? "", customer.last_name ?? ""].map((name) => name.trim()).filter(Boolean).join(" ").trim() ||
    customer.email?.trim() ||
    customer.phone?.trim() ||
    customer.phone_number?.trim() ||
    "Customer"
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
    row.customerName,
    row.customerExternalId,
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
const VEHICLE_DIRECTORY_SELECT = "id, shop_id, customer_id, external_id, unit_number, vin, license_plate, year, make, model, submodel, mileage, engine_hours, engine, fuel_type, source_row_id, import_notes, created_at";
const VEHICLE_DIRECTORY_CUSTOMER_SELECT = "id, external_id, name, first_name, last_name, business_name, email, phone, phone_number";

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

function customerLookupErrorSummary(error: unknown): { code: string | null; message: string } | null {
  if (!error) return null;
  if (typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : null,
      message: typeof record.message === "string" ? record.message : String(error),
    };
  }
  return { code: null, message: String(error) };
}

function vehicleDirectoryCustomerDiagnostics(
  shopId: string,
  vehicles: VehicleDirectoryVehicleRow[],
  customersById: Map<string, VehicleDirectoryCustomerRow>,
  customerLookupError: unknown | null,
) {
  console.info("Vehicle directory customer resolution", {
    shopId,
    vehicleCountLoaded: vehicles.length,
    nonNullCustomerIdCount: vehicles.filter((row) => Boolean(row.customer_id?.trim())).length,
    firstVehicleCustomerIds: vehicles.map((row) => row.customer_id?.trim()).filter(Boolean).slice(0, 3),
    customerLookupCount: customersById.size,
    firstLoadedCustomers: Array.from(customersById.values()).slice(0, 3).map((customer) => ({
      id: customer.id,
      external_id: customer.external_id ?? null,
      display_name: customer.display_name ?? null,
      name: customer.name ?? null,
      business_name: customer.business_name ?? null,
    })),
    customerLookupError: customerLookupErrorSummary(customerLookupError),
  });
}

async function fetchCustomersByDirectIds(
  supabase: VehicleDirectoryClient,
  shopId: string,
  customerIds: string[],
): Promise<{ customersById: Map<string, VehicleDirectoryCustomerRow>; error: unknown | null }> {
  const customersById = new Map<string, VehicleDirectoryCustomerRow>();

  for (let index = 0; index < customerIds.length; index += VEHICLE_DIRECTORY_PAGE_SIZE) {
    const ids = customerIds.slice(index, index + VEHICLE_DIRECTORY_PAGE_SIZE);
    const { data, error } = await supabase
      .from("customers")
      .select(VEHICLE_DIRECTORY_CUSTOMER_SELECT)
      .eq("shop_id", shopId)
      .in("id", ids);

    if (error) return { customersById, error };
    for (const customer of (data ?? []) as VehicleDirectoryCustomerRow[]) {
      customersById.set(customer.id, customer);
    }
  }

  return { customersById, error: null };
}

async function fetchCustomersBySameShopFallback(
  supabase: VehicleDirectoryClient,
  shopId: string,
  customerIds: string[],
): Promise<{ customersById: Map<string, VehicleDirectoryCustomerRow>; error: unknown | null }> {
  const wantedIds = new Set(customerIds);
  const customersById = new Map<string, VehicleDirectoryCustomerRow>();
  const customersResult = await fetchPagedRows<VehicleDirectoryCustomerRow>(
    supabase
      .from("customers")
      .select(VEHICLE_DIRECTORY_CUSTOMER_SELECT)
      .eq("shop_id", shopId)
      .order("id", { ascending: true }),
  );

  for (const customer of customersResult.rows) {
    if (wantedIds.has(customer.id)) customersById.set(customer.id, customer);
  }

  return { customersById, error: customersResult.error };
}

export async function fetchVehicleDirectoryRows(supabase: VehicleDirectoryClient, shopId: string): Promise<{ rows: VehicleListRow[]; error: unknown | null }> {
  const vehiclesResult = await fetchPagedRows<VehicleDirectoryVehicleRow>(
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
  let customersById = new Map<string, VehicleDirectoryCustomerRow>();
  let customerLookupError: unknown | null = null;

  if (customerIds.length > 0) {
    const directResult = await fetchCustomersByDirectIds(supabase, shopId, customerIds);
    customersById = directResult.customersById;
    customerLookupError = directResult.error;

    if (directResult.error || directResult.customersById.size === 0) {
      console.warn("Vehicle directory direct customer lookup failed or returned no matches; falling back to same-shop customer scan", {
        shopId,
        customerIdCount: customerIds.length,
        directCustomerLookupCount: directResult.customersById.size,
        customerLookupError: customerLookupErrorSummary(directResult.error),
      });
      const fallbackResult = await fetchCustomersBySameShopFallback(supabase, shopId, customerIds);
      customersById = fallbackResult.customersById;
      customerLookupError = fallbackResult.error ?? directResult.error;
    }
  }

  vehicleDirectoryCustomerDiagnostics(shopId, vehicles, customersById, customerLookupError);

  return {
    rows: vehicles.map((row) => {
      const customer = row.customer_id ? customersById.get(row.customer_id) ?? null : null;
      return {
        ...row,
        customers: customer,
        customerName: vehicleCustomerName(customer),
        customerExternalId: customer?.external_id?.trim() || null,
        customerEmail: customer?.email?.trim() || null,
        customerPhone: customer?.phone?.trim() || customer?.phone_number?.trim() || null,
      };
    }),
    error: vehiclesResult.error,
  };
}
