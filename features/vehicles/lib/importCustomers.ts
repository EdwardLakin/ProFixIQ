import type { Database } from "@shared/types/types/supabase";
import { normalizeCsvHeader, type CsvRow } from "./importCsv";

type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];

function pick(row: CsvRow, names: string[]): string | null {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeCsvHeader(key), value.trim()]));
  for (const name of names) {
    const value = normalized.get(name);
    if (value) return value;
  }
  return null;
}

function numberOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapCustomerCsvRow(row: CsvRow, shopId: string, userId: string): CustomerInsert {
  const firstName = pick(row, ["first_name", "first", "customer_first_name"]);
  const lastName = pick(row, ["last_name", "last", "customer_last_name"]);
  const businessName = pick(row, ["business_name", "company", "fleet", "customer_company"]);
  const inferredName = [firstName, lastName].filter(Boolean).join(" ");
  const name = pick(row, ["name", "customer", "customer_name"]) ?? (inferredName || businessName);

  return {
    shop_id: shopId,
    user_id: userId,
    first_name: firstName,
    last_name: lastName,
    business_name: businessName,
    name: name ?? null,
    email: pick(row, ["email", "customer_email"]),
    phone: pick(row, ["phone", "phone_number", "customer_phone"]),
    phone_number: pick(row, ["phone_number", "phone", "customer_phone"]),
    street: pick(row, ["street", "address", "address_1"]),
    city: pick(row, ["city"]),
    province: pick(row, ["province", "state"]),
    postal_code: pick(row, ["postal_code", "zip", "zip_code"]),
    external_id: pick(row, ["external_id", "customer_id", "customer_number"]),
    import_confidence: 0.86,
    import_notes: "Guided onboarding CSV mapping",
  };
}

export function mapVehicleCsvRow(row: CsvRow, shopId: string, userId: string, customerId?: string | null): VehicleInsert {
  return {
    shop_id: shopId,
    user_id: userId,
    customer_id: customerId ?? null,
    year: numberOrNull(pick(row, ["year", "vehicle_year"])),
    make: pick(row, ["make", "vehicle_make"]),
    model: pick(row, ["model", "vehicle_model"]),
    submodel: pick(row, ["submodel", "trim"]),
    vin: pick(row, ["vin", "vehicle_vin"]),
    license_plate: pick(row, ["license_plate", "plate", "tag"]),
    unit_number: pick(row, ["unit_number", "unit", "fleet_unit"]),
    mileage: pick(row, ["mileage", "odometer"]),
    external_id: pick(row, ["vehicle_id", "vehicle_external_id"]),
    import_confidence: 0.86,
    import_notes: "Guided onboarding CSV mapping",
  };
}
