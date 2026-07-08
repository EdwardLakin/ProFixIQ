import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { compactImportSummary } from "@/features/shared/lib/import/csv";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];

const VEHICLE_IMPORT_INSERT_BATCH_SIZE = 1000;
export const VEHICLE_IMPORT_SAMPLE_LIMIT = 25;
export const VEHICLE_IMPORT_MAX_ROWS = 20_000;

type VehicleMatch = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "external_id" | "vin" | "unit_number" | "license_plate">;
type CustomerResolverRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "external_id" | "email" | "phone" | "phone_number" | "name" | "business_name">;
type CustomerResolverIndex = { byExternalId: Map<string, string>; byEmail: Map<string, string>; byPhone: Map<string, string>; byName: Map<string, string> };
type NormalizedVehicleResult = { ok: true; vehicle: VehicleInsert } | { ok: false; reason: string };
export type VehicleImportRow = { vehicle_id?: unknown; customer_id?: unknown; customer_email?: unknown; email?: unknown; customer_phone?: unknown; phone?: unknown; customer_name?: unknown; name?: unknown; plate?: unknown; state_province?: unknown; trim?: unknown; color?: unknown; odometer?: unknown; odometer_unit?: unknown; engine?: unknown; fuel_type?: unknown; drive_type?: unknown; body_type?: unknown; asset_type?: unknown; status?: unknown; purchase_date?: unknown; in_service_date?: unknown; last_service_date?: unknown; tags?: unknown; notes?: unknown; unit_number?: unknown; vin?: unknown; license_plate?: unknown; year?: unknown; make?: unknown; model?: unknown };
type VehicleCounts = { created: number; updated: number; skipped: number; failed: number; duplicates: number };

function cleanString(value: unknown): string | null { const text = String(value ?? "").trim(); return text.length ? text : null; }
function cleanVin(value: unknown): string | null { return cleanString(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null; }
function cleanPlate(value: unknown): string | null { return cleanString(value)?.toUpperCase() ?? null; }
function cleanYear(value: unknown): number | null { const text = cleanString(value); if (!text) return null; const parsed = Number(text); if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2100) return null; return Math.trunc(parsed); }
function cleanDate(value: unknown): string | null { const text = cleanString(value); if (!text) return null; const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : text; }
function normalizeLookupKey(value: unknown): string | null { return cleanString(value)?.toLowerCase().replace(/\s+/g, " ") ?? null; }
function normalizePhone(value: unknown): string | null { const text = cleanString(value); if (!text) return null; return text.replace(/\D/g, "") || text; }
function omitNullishVehicleUpdate(payload: VehicleUpdate): VehicleUpdate { return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)) as VehicleUpdate; }
function buildVehicleImportNotes(row: VehicleImportRow): string | null { const notes = [["csv_customer_id", row.customer_id], ["csv_notes", row.notes]].map(([label, value]) => { const text = cleanString(value); return text ? `${label}: ${text}` : null; }).filter(Boolean); return notes.length ? notes.join("\n") : null; }

export async function loadCustomerResolverIndex(supabase: SupabaseClient<DB>, shopId: string): Promise<CustomerResolverIndex> {
  const rows: CustomerResolverRow[] = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("customers").select("id, external_id, email, phone, phone_number, name, business_name").eq("shop_id", shopId).range(from, from + pageSize - 1);
    if (error) throw error; rows.push(...((data ?? []) as CustomerResolverRow[])); if (!data || data.length < pageSize) break;
  }
  const index: CustomerResolverIndex = { byExternalId: new Map(), byEmail: new Map(), byPhone: new Map(), byName: new Map() };
  for (const customer of rows) {
    const externalId = normalizeLookupKey(customer.external_id); if (externalId && !index.byExternalId.has(externalId)) index.byExternalId.set(externalId, customer.id);
    const email = normalizeLookupKey(customer.email); if (email && !index.byEmail.has(email)) index.byEmail.set(email, customer.id);
    for (const phoneValue of [customer.phone, customer.phone_number]) { const phone = normalizePhone(phoneValue); if (phone && !index.byPhone.has(phone)) index.byPhone.set(phone, customer.id); }
    for (const nameValue of [customer.name, customer.business_name]) { const name = normalizeLookupKey(nameValue); if (name && !index.byName.has(name)) index.byName.set(name, customer.id); }
  }
  return index;
}
function resolveCustomerId(row: VehicleImportRow, customers: CustomerResolverIndex): string | null { const externalCustomerId = normalizeLookupKey(row.customer_id); if (externalCustomerId) { const match = customers.byExternalId.get(externalCustomerId); if (match) return match; } const email = normalizeLookupKey(row.customer_email ?? row.email); if (email) { const match = customers.byEmail.get(email); if (match) return match; } const phone = normalizePhone(row.customer_phone ?? row.phone); if (phone) { const match = customers.byPhone.get(phone); if (match) return match; } const name = normalizeLookupKey(row.customer_name ?? row.name); if (name) { const match = customers.byName.get(name); if (match) return match; } return null; }
function normalizeRow(row: VehicleImportRow, shopId: string, customers: CustomerResolverIndex): NormalizedVehicleResult {
  const unitNumber = cleanString(row.unit_number); const vin = cleanVin(row.vin); const plate = cleanPlate(row.license_plate ?? row.plate); const year = cleanYear(row.year); const make = cleanString(row.make); const model = cleanString(row.model); const rawCustomerId = cleanString(row.customer_id); const hasCustomerReference = Boolean(rawCustomerId || cleanString(row.customer_email ?? row.email) || cleanString(row.customer_phone ?? row.phone) || cleanString(row.customer_name ?? row.name)); const customerId = resolveCustomerId(row, customers);
  if (!vin && !unitNumber && !plate && !(year && make && model)) return { ok: false, reason: "Missing vehicle identity." };
  if (hasCustomerReference && !customerId) return { ok: false, reason: rawCustomerId ? "Customer not found for external customer_id." : "Customer reference could not be resolved." };
  return { ok: true, vehicle: { shop_id: shopId, unit_number: unitNumber, vin, license_plate: plate, state_province: cleanString(row.state_province), year, make, model, customer_id: customerId, external_id: cleanString(row.vehicle_id), submodel: cleanString(row.trim), color: cleanString(row.color), mileage: cleanString(row.odometer), odometer_unit: cleanString(row.odometer_unit), engine: cleanString(row.engine), fuel_type: cleanString(row.fuel_type), drivetrain: cleanString(row.drive_type), body_type: cleanString(row.body_type), asset_type: cleanString(row.asset_type), status: cleanString(row.status), purchase_date: cleanDate(row.purchase_date), in_service_date: cleanDate(row.in_service_date), last_service_date: cleanDate(row.last_service_date), tags: cleanString(row.tags), notes: cleanString(row.notes), import_notes: buildVehicleImportNotes(row) } };
}
function pushUnique(values: string[], value: string | null | undefined) { if (value && !values.includes(value)) values.push(value); }
function addMatch(index: Map<string, VehicleMatch>, field: "external_id" | "vin" | "unit_number" | "license_plate", vehicle: VehicleMatch) { const value = vehicle[field]; if (value && !index.has(`${field}:${value}`)) index.set(`${field}:${value}`, vehicle); }
async function loadExistingVehicleIndex(supabase: SupabaseClient<DB>, shopId: string, normalizedRows: VehicleInsert[]): Promise<Map<string, VehicleMatch>> {
  const values = { external_id: [] as string[], vin: [] as string[], unit_number: [] as string[], license_plate: [] as string[] };
  for (const row of normalizedRows) { pushUnique(values.external_id, row.external_id); pushUnique(values.vin, row.vin); pushUnique(values.unit_number, row.unit_number); pushUnique(values.license_plate, row.license_plate); }
  const index = new Map<string, VehicleMatch>();
  for (const field of ["external_id", "vin", "unit_number", "license_plate"] as const) {
    if (!values[field].length) continue;
    const { data, error } = await supabase.from("vehicles").select("id, external_id, vin, unit_number, license_plate").eq("shop_id", shopId).in(field, values[field]);
    if (error) throw error;
    for (const vehicle of (data ?? []) as VehicleMatch[]) addMatch(index, field, vehicle);
  }
  return index;
}
function findExistingVehicleInIndex(index: Map<string, VehicleMatch>, normalized: VehicleInsert): VehicleMatch | null {
  return (normalized.external_id ? index.get(`external_id:${normalized.external_id}`) : null) ?? (normalized.vin ? index.get(`vin:${normalized.vin}`) : null) ?? (normalized.unit_number ? index.get(`unit_number:${normalized.unit_number}`) : null) ?? (normalized.license_plate ? index.get(`license_plate:${normalized.license_plate}`) : null) ?? null;
}
function updatePayload(normalized: VehicleInsert): VehicleUpdate { return omitNullishVehicleUpdate({ unit_number: normalized.unit_number, vin: normalized.vin, license_plate: normalized.license_plate, state_province: normalized.state_province, year: normalized.year, make: normalized.make, model: normalized.model, customer_id: normalized.customer_id, external_id: normalized.external_id, submodel: normalized.submodel, color: normalized.color, mileage: normalized.mileage, odometer_unit: normalized.odometer_unit, engine: normalized.engine, fuel_type: normalized.fuel_type, drivetrain: normalized.drivetrain, body_type: normalized.body_type, asset_type: normalized.asset_type, status: normalized.status, purchase_date: normalized.purchase_date, in_service_date: normalized.in_service_date, last_service_date: normalized.last_service_date, tags: normalized.tags, notes: normalized.notes, import_notes: normalized.import_notes }); }

export async function processVehicleImportRows(supabase: SupabaseClient<DB>, shopId: string, rows: VehicleImportRow[]) {
  const customers = await loadCustomerResolverIndex(supabase, shopId);
  const counts: VehicleCounts = { created: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 };
  const skippedRows: Array<{ row: number; reason: string }> = [];
  const failedRows: Array<{ row: number; error: string }> = [];
  const normalizedRows: Array<{ rowNumber: number; vehicle: VehicleInsert }> = [];
  const seenIdentities = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    const normalizedResult = normalizeRow(row, shopId, customers);
    if (!normalizedResult.ok) {
      counts.skipped += 1;
      skippedRows.push({ row: rowNumber, reason: normalizedResult.reason });
      continue;
    }

    const vehicle = normalizedResult.vehicle;
    const identityKeys = [
      vehicle.external_id ? `external_id:${vehicle.external_id}` : null,
      vehicle.vin ? `vin:${vehicle.vin}` : null,
      vehicle.unit_number ? `unit_number:${vehicle.unit_number}` : null,
      vehicle.license_plate ? `license_plate:${vehicle.license_plate}` : null,
    ].filter(Boolean) as string[];
    const duplicateKey = identityKeys.find((key) => seenIdentities.has(key));
    if (duplicateKey) {
      counts.duplicates += 1;
      counts.skipped += 1;
      skippedRows.push({ row: rowNumber, reason: `Duplicate vehicle identity within this CSV (${duplicateKey}).` });
      continue;
    }
    identityKeys.forEach((key) => seenIdentities.add(key));
    normalizedRows.push({ rowNumber, vehicle });
  }

  const existingVehicles = await loadExistingVehicleIndex(supabase, shopId, normalizedRows.map((entry) => entry.vehicle));
  const inserts: VehicleInsert[] = [];
  const insertRows: number[] = [];

  for (const entry of normalizedRows) {
    try {
      const existing = findExistingVehicleInIndex(existingVehicles, entry.vehicle);
      if (existing) {
        const { error } = await supabase.from("vehicles").update(updatePayload(entry.vehicle)).eq("id", existing.id).eq("shop_id", shopId);
        if (error) throw error;
        counts.updated += 1;
        continue;
      }
      inserts.push(entry.vehicle);
      insertRows.push(entry.rowNumber);
    } catch (error) {
      counts.failed += 1;
      failedRows.push({ row: entry.rowNumber, error: error instanceof Error ? error.message : "Vehicle row failed to import." });
    }
  }

  for (let index = 0; index < inserts.length; index += VEHICLE_IMPORT_INSERT_BATCH_SIZE) {
    const vehicleBatch = inserts.slice(index, index + VEHICLE_IMPORT_INSERT_BATCH_SIZE);
    const rowBatch = insertRows.slice(index, index + VEHICLE_IMPORT_INSERT_BATCH_SIZE);
    const { error } = await supabase.from("vehicles").insert(vehicleBatch);
    if (error) {
      counts.failed += rowBatch.length;
      failedRows.push(...rowBatch.map((row) => ({ row, error: error.message })));
    } else {
      counts.created += vehicleBatch.length;
    }
  }

  return compactImportSummary({
    counts,
    totalRows: rows.length,
    skippedRows,
    failedRows,
    sampleLimit: VEHICLE_IMPORT_SAMPLE_LIMIT,
  });
}

