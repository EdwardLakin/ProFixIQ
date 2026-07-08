import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { chunkArray, compactImportSummary } from "@/features/shared/lib/import/csv";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];

export const VEHICLE_IMPORT_BATCH_SIZE = 1000;
export const VEHICLE_IMPORT_STAGING_BATCH_SIZE = 1000;
export const VEHICLE_IMPORT_SAMPLE_LIMIT = 25;
export const VEHICLE_IMPORT_MAX_ROWS = 20_000;

type VehicleMatch = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "external_id" | "vin" | "unit_number" | "license_plate">;
type CustomerResolverRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "external_id" | "email" | "phone" | "phone_number" | "name" | "business_name">;
type CustomerResolverIndex = { byExternalId: Map<string, string>; byEmail: Map<string, string>; byPhone: Map<string, string>; byName: Map<string, string> };
type NormalizedVehicleResult = { ok: true; vehicle: VehicleInsert } | { ok: false; reason: string };
export type VehicleImportRow = { vehicle_id?: unknown; customer_id?: unknown; customer_email?: unknown; email?: unknown; customer_phone?: unknown; phone?: unknown; customer_name?: unknown; name?: unknown; plate?: unknown; state_province?: unknown; trim?: unknown; color?: unknown; odometer?: unknown; odometer_unit?: unknown; engine?: unknown; fuel_type?: unknown; drive_type?: unknown; body_type?: unknown; asset_type?: unknown; status?: unknown; purchase_date?: unknown; in_service_date?: unknown; last_service_date?: unknown; tags?: unknown; notes?: unknown; unit_number?: unknown; vin?: unknown; license_plate?: unknown; year?: unknown; make?: unknown; model?: unknown };
type JobRow = { id: string; shop_id: string; total_rows: number | null; processed_rows: number | null; imported_count: number | null; skipped_count: number | null; failed_count: number | null; summary: Record<string, unknown> | null };
type StagedRow = { id: string; row_number: number; raw_row: VehicleImportRow; status: string | null };
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
function summaryCount(summary: Record<string, unknown> | null, key: string): number {
  const counts = summary?.counts as Record<string, unknown> | undefined;
  return Number(counts?.[key] ?? summary?.[key] ?? 0);
}
function samples(summary: Record<string, unknown> | null) { return { skippedRows: Array.isArray(summary?.skippedRows) ? summary.skippedRows as Array<{ row: number; reason: string }> : [], failedRows: Array.isArray(summary?.failedRows) ? summary.failedRows as Array<{ row: number; error: string }> : [] }; }
function updatePayload(normalized: VehicleInsert): VehicleUpdate { return omitNullishVehicleUpdate({ unit_number: normalized.unit_number, vin: normalized.vin, license_plate: normalized.license_plate, state_province: normalized.state_province, year: normalized.year, make: normalized.make, model: normalized.model, customer_id: normalized.customer_id, external_id: normalized.external_id, submodel: normalized.submodel, color: normalized.color, mileage: normalized.mileage, odometer_unit: normalized.odometer_unit, engine: normalized.engine, fuel_type: normalized.fuel_type, drivetrain: normalized.drivetrain, body_type: normalized.body_type, asset_type: normalized.asset_type, status: normalized.status, purchase_date: normalized.purchase_date, in_service_date: normalized.in_service_date, last_service_date: normalized.last_service_date, tags: normalized.tags, notes: normalized.notes, import_notes: normalized.import_notes }); }

export async function processVehicleImportJobBatch(supabase: SupabaseClient<DB>, jobId?: string, batchSize = VEHICLE_IMPORT_BATCH_SIZE) {
  const client = supabase as unknown as SupabaseClient; let jobQuery = client.from("import_jobs").select("id, shop_id, total_rows, processed_rows, imported_count, skipped_count, failed_count, summary").eq("import_type", "vehicles").in("status", ["queued", "processing"]).order("created_at", { ascending: true }).limit(1); if (jobId) jobQuery = jobQuery.eq("id", jobId);
  const { data: job, error: jobError } = await jobQuery.maybeSingle<JobRow>(); if (jobError) throw jobError; if (!job) return { ok: true, processed: 0, completed: false, job: null };
  await client.from("import_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
  const { data: stagedRows, error: rowsError } = await client.from("import_job_rows").select("id, row_number, raw_row, status").eq("job_id", job.id).eq("status", "queued").order("row_number", { ascending: true }).limit(batchSize); if (rowsError) throw rowsError;
  const rows = (stagedRows ?? []) as StagedRow[];
  if (!rows.length) { const finalSummary = compactImportSummary({ counts: { created: summaryCount(job.summary, "created"), updated: summaryCount(job.summary, "updated"), skipped: job.skipped_count ?? 0, failed: job.failed_count ?? 0, duplicates: summaryCount(job.summary, "duplicates") }, totalRows: job.processed_rows ?? 0, skippedRows: samples(job.summary).skippedRows, failedRows: samples(job.summary).failedRows, sampleLimit: VEHICLE_IMPORT_SAMPLE_LIMIT }); await client.from("import_jobs").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), summary: finalSummary }).eq("id", job.id); return { ok: true, processed: 0, completed: true, job: { id: job.id } }; }
  const customers = await loadCustomerResolverIndex(supabase, job.shop_id); const counts: VehicleCounts = { created: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 }; const rowSamples = samples(job.summary);
  const normalizedRows: Array<{ staged: StagedRow; vehicle: VehicleInsert }> = [];
  const importedRowIds: string[] = [];
  const skippedByReason = new Map<string, string[]>();
  const failedByMessage = new Map<string, string[]>();

  for (const staged of rows) {
    const normalizedResult = normalizeRow(staged.raw_row, job.shop_id, customers);
    if (!normalizedResult.ok) {
      counts.skipped++;
      rowSamples.skippedRows.push({ row: staged.row_number, reason: normalizedResult.reason });
      const ids = skippedByReason.get(normalizedResult.reason) ?? [];
      ids.push(staged.id);
      skippedByReason.set(normalizedResult.reason, ids);
      continue;
    }
    normalizedRows.push({ staged, vehicle: normalizedResult.vehicle });
  }

  const existingVehicles = await loadExistingVehicleIndex(supabase, job.shop_id, normalizedRows.map((entry) => entry.vehicle));
  const inserts: VehicleInsert[] = [];
  const insertRowIds: string[] = [];
  const insertRowNumbers: number[] = [];

  for (const entry of normalizedRows) {
    try {
      const existing = findExistingVehicleInIndex(existingVehicles, entry.vehicle);
      if (existing) {
        const { error } = await supabase.from("vehicles").update(updatePayload(entry.vehicle)).eq("id", existing.id).eq("shop_id", job.shop_id);
        if (error) throw error;
        counts.updated++;
        importedRowIds.push(entry.staged.id);
        continue;
      }
      inserts.push(entry.vehicle);
      insertRowIds.push(entry.staged.id);
      insertRowNumbers.push(entry.staged.row_number);
    } catch (error) {
      counts.failed++;
      const message = error instanceof Error ? error.message : "Vehicle row failed to import.";
      rowSamples.failedRows.push({ row: entry.staged.row_number, error: message });
      const ids = failedByMessage.get(message) ?? [];
      ids.push(entry.staged.id);
      failedByMessage.set(message, ids);
    }
  }

  for (let index = 0; index < inserts.length; index += VEHICLE_IMPORT_STAGING_BATCH_SIZE) {
    const vehicleBatch = inserts.slice(index, index + VEHICLE_IMPORT_STAGING_BATCH_SIZE);
    const rowIdBatch = insertRowIds.slice(index, index + VEHICLE_IMPORT_STAGING_BATCH_SIZE);
    const { error } = await supabase.from("vehicles").insert(vehicleBatch);
    if (error) {
      counts.failed += rowIdBatch.length;
      rowSamples.failedRows.push(...rowIdBatch.map((_, offset) => ({ row: insertRowNumbers[index + offset] ?? 0, error: error.message })));
      const ids = failedByMessage.get(error.message) ?? [];
      ids.push(...rowIdBatch);
      failedByMessage.set(error.message, ids);
    } else {
      counts.created += vehicleBatch.length;
      importedRowIds.push(...rowIdBatch);
    }
  }

  for (const ids of chunkArray(importedRowIds, VEHICLE_IMPORT_STAGING_BATCH_SIZE)) { if (ids.length) await client.from("import_job_rows").update({ status: "imported" }).in("id", ids); }
  for (const [reason, ids] of skippedByReason) { for (const batch of chunkArray(ids, VEHICLE_IMPORT_STAGING_BATCH_SIZE)) await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).in("id", batch); }
  for (const [message, ids] of failedByMessage) { for (const batch of chunkArray(ids, VEHICLE_IMPORT_STAGING_BATCH_SIZE)) await client.from("import_job_rows").update({ status: "failed", error_message: message }).in("id", batch); }
  rowSamples.skippedRows = rowSamples.skippedRows.slice(0, VEHICLE_IMPORT_SAMPLE_LIMIT); rowSamples.failedRows = rowSamples.failedRows.slice(0, VEHICLE_IMPORT_SAMPLE_LIMIT);
  const totalRows = Math.max(0, job.total_rows ?? 0); const previousCreated = summaryCount(job.summary, "created") || (job.imported_count ?? 0); const previousUpdated = summaryCount(job.summary, "updated"); const nextCreated = previousCreated + counts.created; const nextUpdated = previousUpdated + counts.updated; const nextImported = nextCreated + nextUpdated; const nextSkipped = (job.skipped_count ?? 0) + counts.skipped; const nextFailed = (job.failed_count ?? 0) + counts.failed; const processedRows = totalRows > 0 ? Math.min(totalRows, nextImported + nextSkipped + nextFailed) : nextImported + nextSkipped + nextFailed;
  const { count: remainingCount, error: remainingError } = await client.from("import_job_rows").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "queued"); if (remainingError) throw remainingError; const completed = (remainingCount ?? 0) === 0;
  const summary = compactImportSummary({ counts: { created: nextCreated, updated: nextUpdated, skipped: nextSkipped, failed: nextFailed, duplicates: summaryCount(job.summary, "duplicates") + counts.duplicates }, totalRows: completed && totalRows > 0 ? totalRows : processedRows, skippedRows: rowSamples.skippedRows, failedRows: rowSamples.failedRows, sampleLimit: VEHICLE_IMPORT_SAMPLE_LIMIT });
  await client.from("import_jobs").update({ status: completed ? "completed" : "processing", processed_rows: completed && totalRows > 0 ? totalRows : processedRows, imported_count: nextImported, skipped_count: nextSkipped, failed_count: nextFailed, summary, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", job.id);
  return { ok: true, processed: rows.length, completed, job: { id: job.id } };
}

export function stageVehicleImportRows(jobId: string, shopId: string, rows: VehicleImportRow[]) {
  return rows.map((row, index) => ({
    job_id: jobId,
    shop_id: shopId,
    row_number: index + 1,
    raw_row: row as Record<string, unknown>,
    status: "queued",
  }));
}
export { chunkArray };
