import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { chunkArray, compactImportSummary } from "@/features/shared/lib/import/csv";

type DB = Database;
export const VEHICLE_HISTORY_IMPORT_BATCH_SIZE = 1000;
export const VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT = 25;
export const VEHICLE_HISTORY_IMPORT_MAX_ROWS = 20_000;
const RESOLVER_PAGE_SIZE = 1000;

type HistoryImportRow = {
  customer_id?: unknown; vehicle_id?: unknown; vin?: unknown; customer_email?: unknown; email?: unknown;
  customer_phone?: unknown; phone?: unknown; customer_name?: unknown; name?: unknown; service_date?: unknown;
  repair_order_number?: unknown; work_order_number?: unknown; invoice_number?: unknown; odometer?: unknown;
  service_category?: unknown; complaint?: unknown; cause?: unknown; correction?: unknown; parts?: unknown;
  labor_hours?: unknown; total?: unknown; technician?: unknown; advisor?: unknown; notes?: unknown;
};

type CustomerRef = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "external_id" | "email" | "phone" | "phone_number" | "name" | "business_name" | "first_name" | "last_name">;
type VehicleRef = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "external_id" | "vin" | "customer_id">;
type Resolver = { customersById: Map<string, CustomerRef>; customersByExternal: Map<string, CustomerRef>; customersByEmail: Map<string, CustomerRef>; customersByPhone: Map<string, CustomerRef>; customersByName: Map<string, CustomerRef>; vehiclesById: Map<string, VehicleRef>; vehiclesByExternal: Map<string, VehicleRef>; vehiclesByVin: Map<string, VehicleRef>; };
type ImportCounts = { imported: number; updated: number; skipped: number; failed: number; duplicates: number };
type SkipReasonCode =
  | "customer_not_found"
  | "vehicle_not_found"
  | "both_customer_and_vehicle_not_found"
  | "duplicate_history"
  | "invalid_service_date"
  | "invalid_numeric_field";
type DuplicateKey = `${string}:${"work_order_number" | "invoice_number"}:${string}`;

const SKIP_REASON_MESSAGES: Record<SkipReasonCode, string> = {
  customer_not_found: "Existing customer could not be matched.",
  vehicle_not_found: "Existing vehicle could not be matched.",
  both_customer_and_vehicle_not_found: "Existing customer and vehicle could not be matched.",
  duplicate_history: "Duplicate repair order/invoice already exists.",
  invalid_service_date: "Invalid or missing service_date.",
  invalid_numeric_field: "Numeric field must be numeric when provided.",
};

type JobRow = { id: string; shop_id: string; total_rows: number | null; processed_rows: number | null; imported_count: number | null; skipped_count: number | null; failed_count: number | null; summary: Record<string, unknown> | null };
type StagedRow = { id: string; row_number: number; raw_row: HistoryImportRow; status: string | null };

function clean(value: unknown): string | null { const text = String(value ?? "").trim(); return text ? text : null; }
function key(value: unknown): string | null { return clean(value)?.toLowerCase().replace(/\s+/g, " ") ?? null; }
function phone(value: unknown): string | null { const text = clean(value); if (!text) return null; return text.replace(/\D/g, "") || text; }
function vin(value: unknown): string | null { return clean(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null; }
function num(value: unknown): number | null { const text = clean(value); if (!text) return null; const parsed = Number(text.replace(/[$,]/g, "")); return Number.isFinite(parsed) ? parsed : null; }
function validDate(value: unknown): string | null { const text = clean(value); if (!text) return null; const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); }
function customerName(c: CustomerRef): string | null { return c.name || c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null; }

async function selectAllShopRows<T>(
  supabase: SupabaseClient<DB>,
  table: "customers" | "vehicles",
  columns: string,
  shopId: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += RESOLVER_PAGE_SIZE) {
    const to = from + RESOLVER_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("shop_id", shopId)
      .range(from, to);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < RESOLVER_PAGE_SIZE) break;
  }
  return rows;
}

function addCustomerRef(r: Resolver, c: CustomerRef) {
  r.customersById.set(c.id, c);
  const ex = key(c.external_id); if (ex && !r.customersByExternal.has(ex)) r.customersByExternal.set(ex, c);
  const em = key(c.email); if (em && !r.customersByEmail.has(em)) r.customersByEmail.set(em, c);
  for (const p of [c.phone, c.phone_number]) { const ph = phone(p); if (ph && !r.customersByPhone.has(ph)) r.customersByPhone.set(ph, c); }
  for (const n of [c.name, c.business_name, customerName(c)]) { const nk = key(n); if (nk && !r.customersByName.has(nk)) r.customersByName.set(nk, c); }
}
function addVehicleRef(r: Resolver, v: VehicleRef) {
  r.vehiclesById.set(v.id, v);
  const ex = key(v.external_id); if (ex && !r.vehiclesByExternal.has(ex)) r.vehiclesByExternal.set(ex, v);
  const vk = vin(v.vin); if (vk && !r.vehiclesByVin.has(vk)) r.vehiclesByVin.set(vk, v);
}

async function loadResolver(supabase: SupabaseClient<DB>, shopId: string): Promise<Resolver> {
  const [customers, vehicles] = await Promise.all([
    selectAllShopRows<CustomerRef>(supabase, "customers", "id, external_id, email, phone, phone_number, name, business_name, first_name, last_name", shopId),
    selectAllShopRows<VehicleRef>(supabase, "vehicles", "id, external_id, vin, customer_id", shopId),
  ]);
  const r: Resolver = { customersById: new Map(), customersByExternal: new Map(), customersByEmail: new Map(), customersByPhone: new Map(), customersByName: new Map(), vehiclesById: new Map(), vehiclesByExternal: new Map(), vehiclesByVin: new Map() };
  for (const c of customers) addCustomerRef(r, c);
  for (const v of vehicles) addVehicleRef(r, v);
  return r;
}
function resolveCustomer(row: HistoryImportRow, r: Resolver): CustomerRef | null { const ex = key(row.customer_id); if (ex && r.customersByExternal.has(ex)) return r.customersByExternal.get(ex)!; const cid = clean(row.customer_id); if (cid && r.customersById.has(cid)) return r.customersById.get(cid)!; const em = key(row.customer_email ?? row.email); if (em && r.customersByEmail.has(em)) return r.customersByEmail.get(em)!; const ph = phone(row.customer_phone ?? row.phone); if (ph && r.customersByPhone.has(ph)) return r.customersByPhone.get(ph)!; const nm = key(row.customer_name ?? row.name); if (nm && r.customersByName.has(nm)) return r.customersByName.get(nm)!; return null; }
function resolveVehicle(row: HistoryImportRow, r: Resolver): VehicleRef | null { const ex = key(row.vehicle_id); if (ex && r.vehiclesByExternal.has(ex)) return r.vehiclesByExternal.get(ex)!; const vid = clean(row.vehicle_id); if (vid && r.vehiclesById.has(vid)) return r.vehiclesById.get(vid)!; const vk = vin(row.vin); if (vk && r.vehiclesByVin.has(vk)) return r.vehiclesByVin.get(vk)!; return null; }

function duplicateKey(customerId: string, column: "work_order_number" | "invoice_number", value: string): DuplicateKey {
  return `${customerId}:${column}:${value.toLowerCase()}`;
}

function skipSample(row: number, code: SkipReasonCode, repairOrderNumber: string | null, invoiceNumber: string | null, detail?: string) {
  return { row, code, reason: detail ?? SKIP_REASON_MESSAGES[code], repairOrderNumber, invoiceNumber };
}

async function preloadDuplicateHistoryKeys(
  supabase: SupabaseClient<DB>,
  shopId: string,
  rows: Array<{ customerId: string; repairOrderNumber: string | null; invoiceNumber: string | null }>,
): Promise<Set<DuplicateKey>> {
  const keys = new Set<DuplicateKey>();
  const repairOrderNumbers = Array.from(new Set(rows.map((row) => row.repairOrderNumber).filter((value): value is string => Boolean(value))));
  const invoiceNumbers = Array.from(new Set(rows.map((row) => row.invoiceNumber).filter((value): value is string => Boolean(value))));

  for (const batch of chunkArray(repairOrderNumbers, VEHICLE_HISTORY_IMPORT_BATCH_SIZE)) {
    const { data, error } = await supabase.from("history").select("customer_id, work_order_number").eq("shop_id", shopId).in("work_order_number", batch);
    if (error) throw error;
    for (const history of data ?? []) if (history.customer_id && history.work_order_number) keys.add(duplicateKey(history.customer_id, "work_order_number", history.work_order_number));
  }
  for (const batch of chunkArray(invoiceNumbers, VEHICLE_HISTORY_IMPORT_BATCH_SIZE)) {
    const { data, error } = await supabase.from("history").select("customer_id, invoice_number").eq("shop_id", shopId).in("invoice_number", batch);
    if (error) throw error;
    for (const history of data ?? []) if (history.customer_id && history.invoice_number) keys.add(duplicateKey(history.customer_id, "invoice_number", history.invoice_number));
  }
  return keys;
}

function compactSamples(summary: Record<string, unknown> | null) {
  return {
    skippedRows: Array.isArray(summary?.skippedRows) ? summary.skippedRows as unknown[] : [],
    failedRows: Array.isArray(summary?.failedRows) ? summary.failedRows as unknown[] : [],
  };
}

export async function processVehicleHistoryImportJobBatch(supabase: SupabaseClient<DB>, jobId?: string, batchSize = VEHICLE_HISTORY_IMPORT_BATCH_SIZE) {
  const client = supabase as unknown as SupabaseClient;
  let jobQuery = client.from("import_jobs").select("id, shop_id, total_rows, processed_rows, imported_count, skipped_count, failed_count, summary").eq("import_type", "vehicle_history").in("status", ["queued", "processing"]).order("created_at", { ascending: true }).limit(1);
  if (jobId) jobQuery = jobQuery.eq("id", jobId);
  const { data: job, error: jobError } = await jobQuery.maybeSingle<JobRow>();
  if (jobError) throw jobError;
  if (!job) return { ok: true, processed: 0, completed: false, job: null };

  await client.from("import_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
  const { data: stagedRows, error: rowsError } = await client.from("import_job_rows").select("id, row_number, raw_row, status").eq("job_id", job.id).eq("status", "queued").order("row_number", { ascending: true }).limit(batchSize);
  if (rowsError) throw rowsError;
  const rows = (stagedRows ?? []) as StagedRow[];
  if (!rows.length) {
    const finalSummary = compactImportSummary({ counts: { imported: job.imported_count ?? 0, updated: 0, skipped: job.skipped_count ?? 0, failed: job.failed_count ?? 0, duplicates: Number(job.summary?.duplicates ?? 0) }, totalRows: job.processed_rows ?? 0, skippedRows: compactSamples(job.summary).skippedRows, failedRows: compactSamples(job.summary).failedRows, sampleLimit: VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT });
    await client.from("import_jobs").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), summary: finalSummary }).eq("id", job.id);
    return { ok: true, processed: 0, completed: true, job: { id: job.id } };
  }

  const resolver = await loadResolver(supabase, job.shop_id);
  const counts: ImportCounts = { imported: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 };
  const samples = compactSamples(job.summary);
  const payloads: Array<{ stagedId: string; rowNumber: number; repairOrderNumber: string | null; invoiceNumber: string | null; payload: DB["public"]["Tables"]["history"]["Insert"] & Record<string, unknown> }> = [];
  const duplicateCandidates = rows.flatMap((staged) => {
    const row = staged.raw_row;
    const vehicle = resolveVehicle(row, resolver);
    const customer = resolveCustomer(row, resolver) ?? (vehicle?.customer_id ? resolver.customersById.get(vehicle.customer_id) ?? null : null);
    if (!customer) return [];
    return [{ customerId: customer.id, repairOrderNumber: clean(row.repair_order_number ?? row.work_order_number), invoiceNumber: clean(row.invoice_number) }];
  });
  const existingDuplicateKeys = await preloadDuplicateHistoryKeys(supabase, job.shop_id, duplicateCandidates);
  const batchDuplicateKeys = new Set<DuplicateKey>();

  for (const staged of rows) {
    const row = staged.raw_row; const rowNumber = staged.row_number; const repairOrderNumber = clean(row.repair_order_number ?? row.work_order_number); const invoiceNumber = clean(row.invoice_number);
    try {
      const serviceDate = validDate(row.service_date);
      const invalidNumber = ([ ["odometer", row.odometer], ["labor_hours", row.labor_hours], ["total", row.total] ] as const).find(([, value]) => clean(value) && num(value) === null);
      if (!serviceDate || invalidNumber) { const code: SkipReasonCode = !serviceDate ? "invalid_service_date" : "invalid_numeric_field"; const reason = !serviceDate ? SKIP_REASON_MESSAGES.invalid_service_date : `${invalidNumber?.[0]} must be numeric when provided.`; counts.skipped++; samples.skippedRows.push(skipSample(rowNumber, code, repairOrderNumber, invoiceNumber, reason)); await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).eq("id", staged.id); continue; }
      const vehicle = resolveVehicle(row, resolver); const customer = resolveCustomer(row, resolver) ?? (vehicle?.customer_id ? resolver.customersById.get(vehicle.customer_id) ?? null : null);
      const vehicleWasProvided = Boolean(clean(row.vehicle_id) || clean(row.vin));
      if (!customer || (vehicleWasProvided && !vehicle)) {
        const code: SkipReasonCode = !customer && vehicleWasProvided && !vehicle ? "both_customer_and_vehicle_not_found" : !customer ? "customer_not_found" : "vehicle_not_found";
        const reason = SKIP_REASON_MESSAGES[code];
        counts.skipped++; samples.skippedRows.push(skipSample(rowNumber, code, repairOrderNumber, invoiceNumber)); await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).eq("id", staged.id); continue;
      }
      const repairDuplicateKey = repairOrderNumber ? duplicateKey(customer.id, "work_order_number", repairOrderNumber) : null;
      const invoiceDuplicateKey = invoiceNumber ? duplicateKey(customer.id, "invoice_number", invoiceNumber) : null;
      const duplicateFound = Boolean((repairDuplicateKey && (existingDuplicateKeys.has(repairDuplicateKey) || batchDuplicateKeys.has(repairDuplicateKey))) || (invoiceDuplicateKey && (existingDuplicateKeys.has(invoiceDuplicateKey) || batchDuplicateKeys.has(invoiceDuplicateKey))));
      if (duplicateFound) { counts.skipped++; counts.duplicates++; samples.skippedRows.push(skipSample(rowNumber, "duplicate_history", repairOrderNumber, invoiceNumber)); await client.from("import_job_rows").update({ status: "skipped", error_message: SKIP_REASON_MESSAGES.duplicate_history }).eq("id", staged.id); continue; }
      if (repairDuplicateKey) batchDuplicateKeys.add(repairDuplicateKey);
      if (invoiceDuplicateKey) batchDuplicateKeys.add(invoiceDuplicateKey);
      const parts = clean(row.parts); const notes = [clean(row.notes), parts ? `Parts: ${parts}` : null, clean(row.service_category) ? `Service category: ${clean(row.service_category)}` : null].filter(Boolean).join("\n") || null;
      const description = [clean(row.service_category), clean(row.complaint), clean(row.correction)].filter(Boolean).join(" · ") || "Imported historical service record";
      payloads.push({ stagedId: staged.id, rowNumber, repairOrderNumber, invoiceNumber, payload: { shop_id: job.shop_id, customer_id: customer.id, vehicle_id: vehicle?.id ?? null, service_date: serviceDate, description, notes, work_order_number: repairOrderNumber, invoice_number: invoiceNumber, odometer: num(row.odometer), symptom: clean(row.complaint), cause: clean(row.cause), correction: clean(row.correction), labor_hours: num(row.labor_hours), total: num(row.total), advisor_name: clean(row.advisor), assigned_tech_name: clean(row.technician), historical_status: "imported", source_system: "vehicle_history_csv", source_row_id: String(rowNumber), source_payload: JSON.parse(JSON.stringify({ imported_at: new Date().toISOString(), raw_row: row, service_category: clean(row.service_category), parts: clean(row.parts) })) as DB["public"]["Tables"]["history"]["Insert"]["source_payload"] } });
    } catch (error) { counts.failed++; const message = error instanceof Error ? error.message : "History row failed to import."; samples.failedRows.push({ row: rowNumber, error: message, repairOrderNumber, invoiceNumber }); await client.from("import_job_rows").update({ status: "failed", error_message: message }).eq("id", staged.id); }
  }

  for (const batch of chunkArray(payloads, VEHICLE_HISTORY_IMPORT_BATCH_SIZE)) {
    const { error } = await supabase.from("history").insert(batch.map((entry) => entry.payload));
    if (error) {
      for (const entry of batch) {
        const { error: rowError } = await supabase.from("history").insert(entry.payload);
        if (rowError) { counts.failed++; samples.failedRows.push({ row: entry.rowNumber, error: rowError.message, repairOrderNumber: entry.repairOrderNumber, invoiceNumber: entry.invoiceNumber }); await client.from("import_job_rows").update({ status: "failed", error_message: rowError.message }).eq("id", entry.stagedId); }
        else { counts.imported++; await client.from("import_job_rows").update({ status: "imported" }).eq("id", entry.stagedId); }
      }
    } else { counts.imported += batch.length; await client.from("import_job_rows").update({ status: "imported" }).in("id", batch.map((entry) => entry.stagedId)); }
  }

  samples.skippedRows = samples.skippedRows.slice(0, VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT); samples.failedRows = samples.failedRows.slice(0, VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT);
  const totalRows = Math.max(0, job.total_rows ?? 0);
  const nextImported = (job.imported_count ?? 0) + counts.imported;
  const nextSkipped = (job.skipped_count ?? 0) + counts.skipped;
  const nextFailed = (job.failed_count ?? 0) + counts.failed;
  const processedRows = totalRows > 0 ? Math.min(totalRows, nextImported + nextSkipped + nextFailed) : nextImported + nextSkipped + nextFailed;
  const summary = { skippedRows: samples.skippedRows, failedRows: samples.failedRows, duplicates: Number(job.summary?.duplicates ?? 0) + counts.duplicates };
  const { count: remainingCount, error: remainingError } = await client.from("import_job_rows").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "queued");
  if (remainingError) throw remainingError;
  const completed = (remainingCount ?? 0) === 0;
  const reconciledSkipped = completed && totalRows > 0 ? Math.max(0, totalRows - nextImported - nextFailed) : nextSkipped;
  const reconciledProcessed = completed && totalRows > 0 ? totalRows : processedRows;
  await client.from("import_jobs").update({ status: completed ? "completed" : "processing", processed_rows: reconciledProcessed, imported_count: nextImported, skipped_count: reconciledSkipped, failed_count: nextFailed, summary, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", job.id);
  return { ok: true, processed: rows.length, completed, job: { id: job.id } };
}

export async function importVehicleHistoryRowsSynchronously({
  supabase,
  shopId,
  rows,
}: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  rows: HistoryImportRow[];
}) {
  const resolver = await loadResolver(supabase, shopId);
  const counts: ImportCounts = { imported: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 };
  const samples = { skippedRows: [] as unknown[], failedRows: [] as unknown[] };
  const payloads: Array<{ rowNumber: number; repairOrderNumber: string | null; invoiceNumber: string | null; payload: DB["public"]["Tables"]["history"]["Insert"] & Record<string, unknown> }> = [];
  const duplicateCandidates = rows.flatMap((row) => {
    const vehicle = resolveVehicle(row, resolver);
    const customer = resolveCustomer(row, resolver) ?? (vehicle?.customer_id ? resolver.customersById.get(vehicle.customer_id) ?? null : null);
    if (!customer) return [];
    return [{ customerId: customer.id, repairOrderNumber: clean(row.repair_order_number ?? row.work_order_number), invoiceNumber: clean(row.invoice_number) }];
  });
  const existingDuplicateKeys = await preloadDuplicateHistoryKeys(supabase, shopId, duplicateCandidates);
  const batchDuplicateKeys = new Set<DuplicateKey>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    const repairOrderNumber = clean(row.repair_order_number ?? row.work_order_number);
    const invoiceNumber = clean(row.invoice_number);
    try {
      const serviceDate = validDate(row.service_date);
      const invalidNumber = ([ ["odometer", row.odometer], ["labor_hours", row.labor_hours], ["total", row.total] ] as const).find(([, value]) => clean(value) && num(value) === null);
      if (!serviceDate || invalidNumber) {
        const reason = !serviceDate ? "Invalid or missing service_date." : `${invalidNumber?.[0] ?? "value"} must be numeric when provided.`;
        counts.skipped++;
        samples.skippedRows.push(skipSample(rowNumber, !serviceDate ? "invalid_service_date" : "invalid_numeric_field", repairOrderNumber, invoiceNumber, reason));
        continue;
      }
      const vehicle = resolveVehicle(row, resolver);
      const customer = resolveCustomer(row, resolver) ?? (vehicle?.customer_id ? resolver.customersById.get(vehicle.customer_id) ?? null : null);
      const vehicleWasProvided = Boolean(clean(row.vehicle_id) || clean(row.vin));
      if (!customer || (vehicleWasProvided && !vehicle)) {
        const code: SkipReasonCode = !customer && vehicleWasProvided && !vehicle ? "both_customer_and_vehicle_not_found" : !customer ? "customer_not_found" : "vehicle_not_found";
        counts.skipped++;
        samples.skippedRows.push(skipSample(rowNumber, code, repairOrderNumber, invoiceNumber));
        continue;
      }
      const repairDuplicateKey = repairOrderNumber ? duplicateKey(customer.id, "work_order_number", repairOrderNumber) : null;
      const invoiceDuplicateKey = invoiceNumber ? duplicateKey(customer.id, "invoice_number", invoiceNumber) : null;
      const duplicateFound = Boolean((repairDuplicateKey && (existingDuplicateKeys.has(repairDuplicateKey) || batchDuplicateKeys.has(repairDuplicateKey))) || (invoiceDuplicateKey && (existingDuplicateKeys.has(invoiceDuplicateKey) || batchDuplicateKeys.has(invoiceDuplicateKey))));
      if (duplicateFound) {
        counts.skipped++;
        counts.duplicates++;
        samples.skippedRows.push(skipSample(rowNumber, "duplicate_history", repairOrderNumber, invoiceNumber));
        continue;
      }
      if (repairDuplicateKey) batchDuplicateKeys.add(repairDuplicateKey);
      if (invoiceDuplicateKey) batchDuplicateKeys.add(invoiceDuplicateKey);
      const parts = clean(row.parts);
      const notes = [clean(row.notes), parts ? `Parts: ${parts}` : null, clean(row.service_category) ? `Service category: ${clean(row.service_category)}` : null].filter(Boolean).join("\n") || null;
      const description = [clean(row.service_category), clean(row.complaint), clean(row.correction)].filter(Boolean).join(" · ") || "Imported historical service record";
      payloads.push({ rowNumber, repairOrderNumber, invoiceNumber, payload: { shop_id: shopId, customer_id: customer.id, vehicle_id: vehicle?.id ?? null, service_date: serviceDate, description, notes, work_order_number: repairOrderNumber, invoice_number: invoiceNumber, odometer: num(row.odometer), symptom: clean(row.complaint), cause: clean(row.cause), correction: clean(row.correction), labor_hours: num(row.labor_hours), total: num(row.total), advisor_name: clean(row.advisor), assigned_tech_name: clean(row.technician), historical_status: "imported", source_system: "vehicle_history_csv", source_row_id: String(rowNumber), source_payload: JSON.parse(JSON.stringify({ imported_at: new Date().toISOString(), raw_row: row, service_category: clean(row.service_category), parts: clean(row.parts) })) as DB["public"]["Tables"]["history"]["Insert"]["source_payload"] } });
    } catch (error) {
      counts.failed++;
      samples.failedRows.push({ row: rowNumber, error: error instanceof Error ? error.message : "History row failed to import.", repairOrderNumber, invoiceNumber });
    }
  }

  for (const batch of chunkArray(payloads, VEHICLE_HISTORY_IMPORT_BATCH_SIZE)) {
    const { error } = await supabase.from("history").insert(batch.map((entry) => entry.payload));
    if (error) {
      for (const entry of batch) {
        const { error: rowError } = await supabase.from("history").insert(entry.payload);
        if (rowError) {
          counts.failed++;
          samples.failedRows.push({ row: entry.rowNumber, error: rowError.message, repairOrderNumber: entry.repairOrderNumber, invoiceNumber: entry.invoiceNumber });
        } else counts.imported++;
      }
    } else counts.imported += batch.length;
  }

  return compactImportSummary({
    counts,
    totalRows: rows.length,
    skippedRows: samples.skippedRows,
    failedRows: samples.failedRows,
    sampleLimit: VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT,
  });
}
