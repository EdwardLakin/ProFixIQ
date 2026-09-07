import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  appointmentVehicleLabel,
  type AppointmentCustomerVehicleSearchGroup,
  type AppointmentCustomerVehicleSearchResponse,
} from "@/features/scheduling/lib/appointmentCustomerVehicleSearch";

type DB = Database;
type ShopClient = SupabaseClient<DB>;
type CustomerRow = Pick<
  DB["public"]["Tables"]["customers"]["Row"],
  | "id"
  | "account_type"
  | "active"
  | "business_name"
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "phone_number"
  | "identity_name"
  | "identity_email"
  | "identity_phone"
  | "archived_at"
  | "merged_into_customer_id"
>;
type VehicleRow = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  | "id"
  | "customer_id"
  | "year"
  | "make"
  | "model"
  | "vin"
  | "license_plate"
  | "unit_number"
  | "status"
  | "created_at"
>;

const CUSTOMER_COLUMNS =
  "id,account_type,active,business_name,name,first_name,last_name,email,phone,phone_number,identity_name,identity_email,identity_phone,archived_at,merged_into_customer_id";
const VEHICLE_COLUMNS =
  "id,customer_id,year,make,model,vin,license_plate,unit_number,status,created_at";
const CANDIDATE_LIMIT = 30;
const RESULT_LIMIT = 12;
const VEHICLES_PER_CUSTOMER = 8;
const BLOCKED_VEHICLE_STATUSES = new Set([
  "archived",
  "merged",
  "duplicate",
  "inactive",
]);

export function sanitizeAppointmentCustomerVehicleQuery(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9@.+ _'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function searchTerms(query: string): string[] {
  return Array.from(new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])).slice(
    0,
    8,
  );
}

function searchable(values: unknown[]): string {
  return values
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function matchesEveryTerm(values: unknown[], terms: string[]): boolean {
  const text = searchable(values);
  const compact = text.replace(/[^a-z0-9]/g, "");
  return terms.every((term) => {
    const compactTerm = term.replace(/[^a-z0-9]/g, "");
    return text.includes(term) || (compactTerm.length > 0 && compact.includes(compactTerm));
  });
}

function ilikeCandidateFilters(field: string, term: string): string[] {
  const filters = [`${field}.ilike.%${term}%`];
  if (term.length >= 4) {
    filters.push(`${field}.ilike.%${term.split("").join("%")}%`);
  }
  return filters;
}

function customerFilter(term: string): string {
  return [
    "business_name",
    "name",
    "first_name",
    "last_name",
    "identity_name",
    "email",
    "identity_email",
  ]
    .map((field) => `${field}.ilike.%${term}%`)
    .concat(
      ilikeCandidateFilters("phone", term),
      ilikeCandidateFilters("phone_number", term),
      ilikeCandidateFilters("identity_phone", term),
    )
    .join(",");
}

function vehicleFilter(term: string): string {
  const filters = [
    ...ilikeCandidateFilters("vin", term),
    ...ilikeCandidateFilters("license_plate", term),
    `unit_number.ilike.%${term}%`,
    `make.ilike.%${term}%`,
    `model.ilike.%${term}%`,
  ];
  if (/^\d{4}$/.test(term)) filters.push(`year.eq.${term}`);
  return filters.join(",");
}

function customerMatches(row: CustomerRow, terms: string[]): boolean {
  return matchesEveryTerm(
    [
      row.business_name,
      row.name,
      row.first_name,
      row.last_name,
      row.email,
      row.phone,
      row.phone_number,
      row.identity_name,
      row.identity_email,
      row.identity_phone,
    ],
    terms,
  );
}

function vehicleMatches(row: VehicleRow, terms: string[]): boolean {
  return matchesEveryTerm(
    [row.year, row.make, row.model, row.vin, row.license_plate, row.unit_number],
    terms,
  );
}

function customerDisplayName(row: CustomerRow): string {
  return (
    row.business_name?.trim() ||
    row.name?.trim() ||
    row.identity_name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.email?.trim() ||
    "Customer"
  );
}

function customerEmail(row: CustomerRow): string | null {
  return row.email?.trim() || row.identity_email?.trim() || null;
}

function customerPhone(row: CustomerRow): string | null {
  return (
    row.phone?.trim() ||
    row.phone_number?.trim() ||
    row.identity_phone?.trim() ||
    null
  );
}

function vehicleAllowed(row: VehicleRow): boolean {
  return !BLOCKED_VEHICLE_STATUSES.has(String(row.status ?? "").trim().toLowerCase());
}

export async function searchAppointmentCustomerVehicles({
  supabase,
  shopId,
  query,
}: {
  supabase: ShopClient;
  shopId: string;
  query: unknown;
}): Promise<AppointmentCustomerVehicleSearchResponse> {
  const sanitized = sanitizeAppointmentCustomerVehicleQuery(query);
  const terms = searchTerms(sanitized);
  if (sanitized.length < 2 || terms.length === 0) {
    return { query: sanitized, groups: [] };
  }

  const firstTerm = terms[0];
  const [customerCandidates, vehicleCandidates] = await Promise.all([
    supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq("shop_id", shopId)
      .is("archived_at", null)
      .is("merged_into_customer_id", null)
      .or(customerFilter(firstTerm))
      .limit(CANDIDATE_LIMIT),
    supabase
      .from("vehicles")
      .select(VEHICLE_COLUMNS)
      .eq("shop_id", shopId)
      .or(vehicleFilter(firstTerm))
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT),
  ]);

  if (customerCandidates.error) throw new Error(customerCandidates.error.message);
  if (vehicleCandidates.error) throw new Error(vehicleCandidates.error.message);

  const matchedCustomers = ((customerCandidates.data ?? []) as CustomerRow[]).filter(
    (row) => customerMatches(row, terms),
  );
  const matchedVehicles = ((vehicleCandidates.data ?? []) as VehicleRow[]).filter(
    (row) => vehicleAllowed(row) && vehicleMatches(row, terms),
  );

  const customerIds = new Set<string>(matchedCustomers.map((row) => row.id));
  for (const vehicle of matchedVehicles) {
    if (vehicle.customer_id) customerIds.add(vehicle.customer_id);
  }
  if (customerIds.size === 0) return { query: sanitized, groups: [] };

  const customerIdList = Array.from(customerIds).slice(0, RESULT_LIMIT);
  const [canonicalCustomers, relatedVehicles] = await Promise.all([
    supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq("shop_id", shopId)
      .in("id", customerIdList)
      .is("archived_at", null)
      .is("merged_into_customer_id", null),
    supabase
      .from("vehicles")
      .select(VEHICLE_COLUMNS)
      .eq("shop_id", shopId)
      .in("customer_id", customerIdList)
      .order("created_at", { ascending: false })
      .limit(RESULT_LIMIT * VEHICLES_PER_CUSTOMER),
  ]);

  if (canonicalCustomers.error) throw new Error(canonicalCustomers.error.message);
  if (relatedVehicles.error) throw new Error(relatedVehicles.error.message);

  const matchedCustomerIds = new Set(matchedCustomers.map((row) => row.id));
  const matchedVehicleIds = new Set(matchedVehicles.map((row) => row.id));
  const vehiclesByCustomer = new Map<string, VehicleRow[]>();
  for (const row of (relatedVehicles.data ?? []) as VehicleRow[]) {
    if (!row.customer_id || !vehicleAllowed(row)) continue;
    const current = vehiclesByCustomer.get(row.customer_id) ?? [];
    if (current.length < VEHICLES_PER_CUSTOMER) {
      current.push(row);
      vehiclesByCustomer.set(row.customer_id, current);
    }
  }

  const groups: AppointmentCustomerVehicleSearchGroup[] = (
    (canonicalCustomers.data ?? []) as CustomerRow[]
  )
    .filter((row) => row.active !== false)
    .map((customer) => ({
      customer: {
        id: customer.id,
        displayName: customerDisplayName(customer),
        email: customerEmail(customer),
        phone: customerPhone(customer),
        accountType: customer.account_type ?? null,
      },
      vehicles: (vehiclesByCustomer.get(customer.id) ?? []).map((vehicle) => {
        const result = {
          id: vehicle.id,
          customerId: customer.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          vin: vehicle.vin,
          licensePlate: vehicle.license_plate,
          unitNumber: vehicle.unit_number,
          label: "",
        };
        result.label = appointmentVehicleLabel(result);
        return result;
      }),
      matchedCustomer: matchedCustomerIds.has(customer.id),
      matchedVehicleIds: (vehiclesByCustomer.get(customer.id) ?? [])
        .filter((vehicle) => matchedVehicleIds.has(vehicle.id))
        .map((vehicle) => vehicle.id),
    }))
    .sort((a, b) => {
      const aVehicle = a.matchedVehicleIds.length > 0 ? 1 : 0;
      const bVehicle = b.matchedVehicleIds.length > 0 ? 1 : 0;
      if (aVehicle !== bVehicle) return bVehicle - aVehicle;
      if (a.matchedCustomer !== b.matchedCustomer)
        return Number(b.matchedCustomer) - Number(a.matchedCustomer);
      return a.customer.displayName.localeCompare(b.customer.displayName);
    })
    .slice(0, RESULT_LIMIT);

  return { query: sanitized, groups };
}
