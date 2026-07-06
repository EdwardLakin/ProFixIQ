import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { chunkArray } from "@/features/shared/lib/import/csv";

type DB = Database;
export const INVOICE_IMPORT_BATCH_SIZE = 1000;
export const INVOICE_IMPORT_SAMPLE_LIMIT = 25;
export const INVOICE_IMPORT_MAX_ROWS = 20_000;

type InvoiceImportRow = Record<string, unknown>;
type JobRow = { id: string; shop_id: string; processed_rows: number | null; imported_count: number | null; skipped_count: number | null; failed_count: number | null; summary: Record<string, unknown> | null };
type StagedRow = { id: string; row_number: number; raw_row: InvoiceImportRow; status: string | null };
type Counts = { imported: number; skipped: number; failed: number; duplicates: number };
type MatchedCustomer = { id: string; external_id?: string | null };
type MatchedVehicle = { id: string; external_id?: string | null; vin?: string | null; customer_id?: string | null };
type MatchedWorkOrder = { id: string; custom_id?: string | null; customer_id?: string | null; vehicle_id?: string | null };

const clean = (value: unknown) => { const text = String(value ?? "").trim(); return text || null; };
const key = (value: unknown) => clean(value)?.toLowerCase() ?? null;
const num = (value: unknown) => { const text = clean(value); if (!text) return null; const parsed = Number(text.replace(/[$,]/g, "")); return Number.isFinite(parsed) ? parsed : null; };
const date = (value: unknown) => { const text = clean(value); if (!text) return null; const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(); };
const vin = (value: unknown) => clean(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;

async function duplicateInvoice(client: SupabaseClient, shopId: string, invoiceNumber: string | null, sourceId: string | null) {
  if (invoiceNumber) {
    const { data, error } = await client.from("invoices").select("id").eq("shop_id", shopId).eq("invoice_number", invoiceNumber).limit(1);
    if (error) throw error;
    if (data?.length) return true;
  }

  if (sourceId) {
    const { data, error } = await client.from("invoices").select("id").eq("shop_id", shopId).contains("metadata", { imported_invoice_id: sourceId }).limit(1);
    if (error) throw error;
    if (data?.length) return true;
  }

  return false;
}

export const CANONICAL_INVOICE_IMPORT_STATUSES = ["draft", "issued", "paid", "void"] as const;
type CanonicalInvoiceImportStatus = (typeof CANONICAL_INVOICE_IMPORT_STATUSES)[number];

const PAID_IMPORT_STATUSES = new Set(["paid", "closed_paid", "paid_in_full", "paid_full", "complete_paid"]);
const OPEN_IMPORT_STATUSES = new Set(["", "unpaid", "open", "issued", "sent", "partial", "partially_paid", "partial_paid", "payment_due", "past_due", "overdue"]);
const VOID_IMPORT_STATUSES = new Set(["void", "voided", "cancelled", "canceled", "closed", "written_off", "write_off", "bad_debt", "uncollectible"]);
const DRAFT_IMPORT_STATUSES = new Set(["draft", "estimate", "pending"]);
const NEVER_IMPORT_INVOICE_STATUSES = new Set(["credit", "credit_memo", "refund", "refunded", "reversed", "chargeback"]);

export function normalizeInvoiceImportStatus(row: InvoiceImportRow): CanonicalInvoiceImportStatus | null {
  const raw = key(row.payment_status ?? row.status) ?? "";
  if (NEVER_IMPORT_INVOICE_STATUSES.has(raw)) return null;
  if (OPEN_IMPORT_STATUSES.has(raw)) return "issued";
  if (PAID_IMPORT_STATUSES.has(raw) || raw.endsWith("_paid")) return "paid";
  if (VOID_IMPORT_STATUSES.has(raw) || raw.includes("void") || raw.includes("cancel")) return "void";
  if (DRAFT_IMPORT_STATUSES.has(raw)) return "draft";
  return "issued";
}

export function resolveImportedInvoicePaidAt(row: InvoiceImportRow, issuedAt: string, status = normalizeInvoiceImportStatus(row)) {
  if (status !== "paid") return null;
  return date(row.paid_date) ?? issuedAt;
}

function samples(summary: Record<string, unknown> | null) {
  return {
    skippedRows: Array.isArray(summary?.skippedRows) ? summary.skippedRows as unknown[] : [],
    failedRows: Array.isArray(summary?.failedRows) ? summary.failedRows as unknown[] : [],
  };
}

export async function processInvoiceImportJobBatch(supabase: SupabaseClient<DB>, jobId?: string, batchSize = INVOICE_IMPORT_BATCH_SIZE) {
  const client = supabase as unknown as SupabaseClient;
  let jobQuery = client.from("import_jobs").select("id, shop_id, processed_rows, imported_count, skipped_count, failed_count, summary").eq("import_type", "invoices").in("status", ["queued", "processing"]).order("created_at", { ascending: true }).limit(1);
  if (jobId) jobQuery = jobQuery.eq("id", jobId);

  const { data: job, error: jobError } = await jobQuery.maybeSingle<JobRow>();
  if (jobError) throw jobError;
  if (!job) return { ok: true, processed: 0, completed: false, job: null };

  await client.from("import_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);

  const { data, error } = await client.from("import_job_rows").select("id, row_number, raw_row, status").eq("job_id", job.id).eq("status", "queued").order("row_number", { ascending: true }).limit(batchSize);
  if (error) throw error;

  const rows = (data ?? []) as StagedRow[];
  if (!rows.length) {
    await client.from("import_jobs").update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: true, processed: 0, completed: true, job: { id: job.id } };
  }

  const [{ data: customers }, { data: vehicles }, { data: workOrders }] = await Promise.all([
    client.from("customers").select("id, external_id").eq("shop_id", job.shop_id),
    client.from("vehicles").select("id, external_id, vin, customer_id").eq("shop_id", job.shop_id),
    client.from("work_orders").select("id, custom_id, customer_id, vehicle_id").eq("shop_id", job.shop_id),
  ]);

  const customersById = new Map<string, MatchedCustomer>();
  for (const customer of (customers ?? []) as MatchedCustomer[]) {
    if (customer.id) customersById.set(customer.id, customer);
    const external = String(customer.external_id ?? "").toLowerCase();
    if (external) customersById.set(external, customer);
  }

  const vehiclesById = new Map<string, MatchedVehicle>();
  for (const vehicle of (vehicles ?? []) as MatchedVehicle[]) {
    if (vehicle.id) vehiclesById.set(vehicle.id, vehicle);
    const external = String(vehicle.external_id ?? "").toLowerCase();
    if (external) vehiclesById.set(external, vehicle);
    const normalizedVin = vin(vehicle.vin);
    if (normalizedVin) vehiclesById.set(normalizedVin, vehicle);
  }

  const workOrdersByNumber = new Map<string, MatchedWorkOrder>();
  for (const workOrder of (workOrders ?? []) as MatchedWorkOrder[]) {
    const customId = String(workOrder.custom_id ?? "").toLowerCase();
    if (customId) workOrdersByNumber.set(customId, workOrder);
    if (workOrder.id) workOrdersByNumber.set(workOrder.id, workOrder);
  }

  const counts: Counts = { imported: 0, skipped: 0, failed: 0, duplicates: 0 };
  const sample = samples(job.summary);
  const inserts: Array<{ stagedId: string; rowNumber: number; invoiceNumber: string | null; workOrderNumber: string | null; payload: DB["public"]["Tables"]["invoices"]["Insert"] }> = [];

  for (const staged of rows) {
    const row = staged.raw_row;
    const invoiceNumber = clean(row.invoice_number ?? row.invoice_id);
    const sourceId = clean(row.invoice_id);
    const workOrderNumber = clean(row.work_order_number);

    try {
      const issued = date(row.invoice_date);
      if (!issued || !invoiceNumber) {
        const reason = !issued ? "Invalid or missing invoice_date." : "Missing invoice_number or invoice_id.";
        counts.skipped++;
        sample.skippedRows.push({ row: staged.row_number, reason, invoiceNumber, workOrderNumber });
        await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).eq("id", staged.id);
        continue;
      }

      if (await duplicateInvoice(client, job.shop_id, invoiceNumber, sourceId)) {
        counts.skipped++;
        counts.duplicates++;
        const reason = "Duplicate invoice already exists.";
        sample.skippedRows.push({ row: staged.row_number, reason, invoiceNumber, workOrderNumber });
        await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).eq("id", staged.id);
        continue;
      }

      const workOrder = workOrderNumber ? workOrdersByNumber.get(workOrderNumber.toLowerCase()) : null;
      const vehicle = (clean(row.vehicle_id) ? vehiclesById.get(clean(row.vehicle_id)!) ?? vehiclesById.get(clean(row.vehicle_id)!.toLowerCase()) : null) ?? (vin(row.vin) ? vehiclesById.get(vin(row.vin)!) : null);
      const customer = (clean(row.customer_id) ? customersById.get(clean(row.customer_id)!) ?? customersById.get(clean(row.customer_id)!.toLowerCase()) : null);
      const customerId = customer?.id ?? workOrder?.customer_id ?? vehicle?.customer_id ?? null;
      const vehicleId = vehicle?.id ?? workOrder?.vehicle_id ?? null;
      const total = num(row.total) ?? num(row.subtotal) ?? 0;
      const amountPaid = num(row.amount_paid) ?? 0;
      const status = normalizeInvoiceImportStatus(row);
      if (!status) {
        const reason = "Invoice status represents a credit/refund reversal and is not imported as an invoice.";
        counts.skipped++;
        sample.skippedRows.push({ row: staged.row_number, reason, invoiceNumber, workOrderNumber, sourceStatus: clean(row.payment_status ?? row.status) });
        await client.from("import_job_rows").update({ status: "skipped", error_message: reason }).eq("id", staged.id);
        continue;
      }

      inserts.push({
        stagedId: staged.id,
        rowNumber: staged.row_number,
        invoiceNumber,
        workOrderNumber,
        payload: {
          shop_id: job.shop_id,
          customer_id: customerId,
          work_order_id: workOrder?.id ?? null,
          invoice_number: invoiceNumber,
          issued_at: issued,
          due_date: date(row.due_date),
          paid_at: resolveImportedInvoicePaidAt(row, issued, status),
          status,
          labor_cost: num(row.labor_total) ?? 0,
          parts_cost: num(row.parts_total) ?? 0,
          subtotal: num(row.subtotal) ?? total,
          tax_total: num(row.tax) ?? 0,
          total,
          notes: [clean(row.description), clean(row.notes)].filter(Boolean).join("\n") || null,
          metadata: {
            imported: true,
            read_only: true,
            import_type: "invoice_csv",
            imported_invoice_id: sourceId,
            source_system: clean(row.source_system),
            work_order_number: workOrderNumber,
            vehicle_id: vehicleId,
            vin: clean(row.vin),
            service_category: clean(row.service_category),
            labor_hours: num(row.labor_hours),
            shop_supplies: num(row.shop_supplies),
            amount_paid: amountPaid,
            balance_due: num(row.balance_due) ?? Math.max(0, total - amountPaid),
            advisor: clean(row.advisor),
            technician: clean(row.technician),
            raw_row: row,
          } as DB["public"]["Tables"]["invoices"]["Insert"]["metadata"],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invoice row failed to import.";
      counts.failed++;
      sample.failedRows.push({ row: staged.row_number, error: message, invoiceNumber, workOrderNumber });
      await client.from("import_job_rows").update({ status: "failed", error_message: message }).eq("id", staged.id);
    }
  }

  for (const batch of chunkArray(inserts, batchSize)) {
    const { error: insertError } = await supabase.from("invoices").insert(batch.map((entry) => entry.payload));
    if (insertError) {
      for (const entry of batch) {
        const { error: rowError } = await supabase.from("invoices").insert(entry.payload);
        if (rowError) {
          counts.failed++;
          sample.failedRows.push({ row: entry.rowNumber, error: rowError.message, invoiceNumber: entry.invoiceNumber, workOrderNumber: entry.workOrderNumber });
          await client.from("import_job_rows").update({ status: "failed", error_message: rowError.message }).eq("id", entry.stagedId);
        } else {
          counts.imported++;
          await client.from("import_job_rows").update({ status: "imported" }).eq("id", entry.stagedId);
        }
      }
    } else {
      counts.imported += batch.length;
      await client.from("import_job_rows").update({ status: "imported" }).in("id", batch.map((entry) => entry.stagedId));
    }
  }

  const processedRows = (job.processed_rows ?? 0) + rows.length;
  const summary = {
    skippedRows: sample.skippedRows.slice(0, INVOICE_IMPORT_SAMPLE_LIMIT),
    failedRows: sample.failedRows.slice(0, INVOICE_IMPORT_SAMPLE_LIMIT),
    duplicates: Number(job.summary?.duplicates ?? 0) + counts.duplicates,
  };
  const { count } = await client.from("import_job_rows").select("id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", "queued");
  const completed = (count ?? 0) === 0;

  await client.from("import_jobs").update({ status: completed ? "completed" : "processing", processed_rows: processedRows, imported_count: (job.imported_count ?? 0) + counts.imported, skipped_count: (job.skipped_count ?? 0) + counts.skipped, failed_count: (job.failed_count ?? 0) + counts.failed, summary, completed_at: completed ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", job.id);

  return { ok: true, processed: rows.length, completed, job: { id: job.id } };
}
