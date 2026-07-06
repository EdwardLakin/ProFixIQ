import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { chunkArray } from "@/features/shared/lib/import/csv";

type DB = Database;
export const INVOICE_IMPORT_BATCH_SIZE = 1000;
export const INVOICE_IMPORT_SAMPLE_LIMIT = 25;
export const INVOICE_IMPORT_MAX_ROWS = 20_000;

type InvoiceImportRow = Record<string, unknown>;
type JobRow = {
  id: string;
  shop_id: string;
  total_rows: number | null;
  processed_rows: number | null;
  imported_count: number | null;
  skipped_count: number | null;
  failed_count: number | null;
  summary: Record<string, unknown> | null;
};
type StagedRow = {
  id: string;
  row_number: number;
  raw_row: InvoiceImportRow;
  status: string | null;
};
type Counts = {
  imported: number;
  skipped: number;
  failed: number;
  duplicates: number;
};
type MatchedCustomer = {
  id: string;
  external_id?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  name?: string | null;
  business_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};
type MatchedVehicle = {
  id: string;
  external_id?: string | null;
  vin?: string | null;
  customer_id?: string | null;
};
type MatchedWorkOrder = {
  id: string;
  custom_id?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
};
type ExistingInvoiceMatch = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

const clean = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};
const key = (value: unknown) => clean(value)?.toLowerCase() ?? null;
const phone = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  return text.replace(/\D/g, "") || text;
};
const num = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const date = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const vin = (value: unknown) =>
  clean(value)
    ?.toUpperCase()
    .replace(/[^A-Z0-9]/g, "") ?? null;

function matchedCustomerName(customer: MatchedCustomer): string | null {
  return (
    clean(customer.name) ??
    clean(customer.business_name) ??
    clean([customer.first_name, customer.last_name].filter(Boolean).join(" "))
  );
}

type CustomerLookupMaps = {
  byExternalId: Map<string, MatchedCustomer>;
  byExternalIdKey: Map<string, MatchedCustomer>;
  byEmail: Map<string, MatchedCustomer>;
  byPhone: Map<string, MatchedCustomer>;
  byName: Map<string, MatchedCustomer>;
};

export function buildCustomerLookupMaps(
  customers: MatchedCustomer[],
): CustomerLookupMaps {
  const byExternalId = new Map<string, MatchedCustomer>();
  const byExternalIdKey = new Map<string, MatchedCustomer>();
  const byEmail = new Map<string, MatchedCustomer>();
  const byPhone = new Map<string, MatchedCustomer>();
  const byName = new Map<string, MatchedCustomer>();

  for (const customer of customers) {
    const externalId = clean(customer.external_id);
    if (externalId && !byExternalId.has(externalId)) {
      byExternalId.set(externalId, customer);
    }

    const externalIdKey = key(customer.external_id);
    if (externalIdKey && !byExternalIdKey.has(externalIdKey)) {
      byExternalIdKey.set(externalIdKey, customer);
    }

    const email = key(customer.email);
    if (email && !byEmail.has(email)) byEmail.set(email, customer);

    for (const phoneValue of [customer.phone, customer.phone_number]) {
      const normalizedPhone = phone(phoneValue);
      if (normalizedPhone && !byPhone.has(normalizedPhone)) {
        byPhone.set(normalizedPhone, customer);
      }
    }

    const name = key(matchedCustomerName(customer));
    if (name && !byName.has(name)) byName.set(name, customer);
  }

  return { byExternalId, byExternalIdKey, byEmail, byPhone, byName };
}

export function resolveInvoiceImportCustomer(
  row: InvoiceImportRow,
  customerLookupMaps: CustomerLookupMaps,
) {
  const legacyCustomerId = clean(row.customer_id);
  const customerByLegacyId = legacyCustomerId
    ? (customerLookupMaps.byExternalId.get(legacyCustomerId) ??
      customerLookupMaps.byExternalIdKey.get(key(legacyCustomerId)!) ??
      null)
    : null;
  const customerEmailKey = key(row.customer_email ?? row.email);
  const customerByEmail = customerEmailKey
    ? (customerLookupMaps.byEmail.get(customerEmailKey) ?? null)
    : null;
  const customerPhoneKey = phone(row.customer_phone ?? row.phone);
  const customerByPhone = customerPhoneKey
    ? (customerLookupMaps.byPhone.get(customerPhoneKey) ?? null)
    : null;
  const customerNameKey = key(row.customer_name ?? row.customer ?? row.name);
  const customerByName = customerNameKey
    ? (customerLookupMaps.byName.get(customerNameKey) ?? null)
    : null;
  const customer =
    customerByLegacyId ?? customerByEmail ?? customerByPhone ?? customerByName;
  const customerMatchSource = customerByLegacyId
    ? "customer_external_id"
    : customerByEmail
      ? "email"
      : customerByPhone
        ? "phone"
        : customerByName
          ? "name"
          : null;

  return { customer, customerMatchSource, legacyCustomerId };
}

function isInvoiceNumberUniqueConflict(error: unknown) {
  const candidate = error as
    | { code?: string; message?: string; details?: string; hint?: string }
    | null
    | undefined;
  if (!candidate) return false;
  const text = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ");
  return (
    candidate.code === "23505" &&
    text.includes("invoices_shop_invoice_number_idx")
  );
}

export function isHistoricalInvoiceCsvMetadata(metadata: unknown) {
  return (
    !!metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).import_type === "invoice_csv"
  );
}

async function findHistoricalInvoice(
  client: SupabaseClient,
  shopId: string,
  invoiceNumber: string | null,
  sourceId: string | null,
): Promise<ExistingInvoiceMatch | null> {
  if (sourceId) {
    const { data, error } = await client
      .from("invoices")
      .select("id, metadata")
      .eq("shop_id", shopId)
      .contains("metadata", {
        import_type: "invoice_csv",
        imported_invoice_id: sourceId,
      })
      .limit(1);
    if (error) throw error;
    const match = (data?.[0] as ExistingInvoiceMatch | undefined) ?? null;
    if (match) return match;
  }

  if (invoiceNumber) {
    const { data, error } = await client
      .from("invoices")
      .select("id, metadata")
      .eq("shop_id", shopId)
      .eq("invoice_number", invoiceNumber)
      .contains("metadata", { import_type: "invoice_csv" })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as ExistingInvoiceMatch | undefined) ?? null;
  }

  return null;
}

async function hasLiveInvoiceNumberCollision(
  client: SupabaseClient,
  shopId: string,
  invoiceNumber: string | null,
) {
  if (!invoiceNumber) return false;
  const { data, error } = await client
    .from("invoices")
    .select("id, metadata")
    .eq("shop_id", shopId)
    .eq("invoice_number", invoiceNumber)
    .limit(10);
  if (error) throw error;

  return ((data ?? []) as ExistingInvoiceMatch[]).some(
    (invoice) => !isHistoricalInvoiceCsvMetadata(invoice.metadata),
  );
}

export const CANONICAL_INVOICE_IMPORT_STATUSES = [
  "draft",
  "issued",
  "paid",
  "void",
] as const;
type CanonicalInvoiceImportStatus =
  (typeof CANONICAL_INVOICE_IMPORT_STATUSES)[number];

const PAID_IMPORT_STATUSES = new Set([
  "paid",
  "closed_paid",
  "paid_in_full",
  "paid_full",
  "complete_paid",
]);
const OPEN_IMPORT_STATUSES = new Set([
  "",
  "unpaid",
  "open",
  "issued",
  "sent",
  "partial",
  "partially_paid",
  "partial_paid",
  "payment_due",
  "past_due",
  "overdue",
]);
const VOID_IMPORT_STATUSES = new Set([
  "void",
  "voided",
  "cancelled",
  "canceled",
  "closed",
  "written_off",
  "write_off",
  "bad_debt",
  "uncollectible",
]);
const DRAFT_IMPORT_STATUSES = new Set(["draft", "estimate", "pending"]);
const NEVER_IMPORT_INVOICE_STATUSES = new Set([
  "credit",
  "credit_memo",
  "refund",
  "refunded",
  "reversed",
  "chargeback",
]);

export function normalizeInvoiceImportStatus(
  row: InvoiceImportRow,
): CanonicalInvoiceImportStatus | null {
  const raw = key(row.payment_status ?? row.status) ?? "";
  if (NEVER_IMPORT_INVOICE_STATUSES.has(raw)) return null;
  if (OPEN_IMPORT_STATUSES.has(raw)) return "issued";
  if (PAID_IMPORT_STATUSES.has(raw) || raw.endsWith("_paid")) return "paid";
  if (
    VOID_IMPORT_STATUSES.has(raw) ||
    raw.includes("void") ||
    raw.includes("cancel")
  )
    return "void";
  if (DRAFT_IMPORT_STATUSES.has(raw)) return "draft";
  return "issued";
}

export function resolveImportedInvoicePaidAt(
  row: InvoiceImportRow,
  issuedAt: string,
  status = normalizeInvoiceImportStatus(row),
) {
  if (status !== "paid") return null;
  return date(row.paid_date) ?? issuedAt;
}

function samples(summary: Record<string, unknown> | null) {
  return {
    skippedRows: Array.isArray(summary?.skippedRows)
      ? (summary.skippedRows as unknown[])
      : [],
    failedRows: Array.isArray(summary?.failedRows)
      ? (summary.failedRows as unknown[])
      : [],
  };
}

export async function processInvoiceImportJobBatch(
  supabase: SupabaseClient<DB>,
  jobId?: string,
  batchSize = INVOICE_IMPORT_BATCH_SIZE,
) {
  const client = supabase as unknown as SupabaseClient;
  let jobQuery = client
    .from("import_jobs")
    .select(
      "id, shop_id, total_rows, processed_rows, imported_count, skipped_count, failed_count, summary",
    )
    .eq("import_type", "invoices")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (jobId) jobQuery = jobQuery.eq("id", jobId);

  const { data: job, error: jobError } = await jobQuery.maybeSingle<JobRow>();
  if (jobError) throw jobError;
  if (!job) return { ok: true, processed: 0, completed: false, job: null };

  await client
    .from("import_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job.id);

  const { data, error } = await client
    .from("import_job_rows")
    .select("id, row_number, raw_row, status")
    .eq("job_id", job.id)
    .eq("status", "queued")
    .order("row_number", { ascending: true })
    .limit(batchSize);
  if (error) throw error;

  const rows = (data ?? []) as StagedRow[];
  if (!rows.length) {
    await client
      .from("import_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: true, processed: 0, completed: true, job: { id: job.id } };
  }

  const [{ data: customers }, { data: vehicles }, { data: workOrders }] =
    await Promise.all([
      client
        .from("customers")
        .select(
          "id, external_id, email, phone, phone_number, name, business_name, first_name, last_name",
        )
        .eq("shop_id", job.shop_id),
      client
        .from("vehicles")
        .select("id, external_id, vin, customer_id")
        .eq("shop_id", job.shop_id),
      client
        .from("work_orders")
        .select("id, custom_id, customer_id, vehicle_id")
        .eq("shop_id", job.shop_id),
    ]);

  const customerLookupMaps = buildCustomerLookupMaps(
    (customers ?? []) as MatchedCustomer[],
  );

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
  const pendingInvoiceNumbers = new Set<string>();
  const writes: Array<{
    stagedId: string;
    rowNumber: number;
    invoiceNumber: string | null;
    workOrderNumber: string | null;
    existingInvoiceId: string | null;
    payload: DB["public"]["Tables"]["invoices"]["Insert"];
  }> = [];

  for (const staged of rows) {
    const row = staged.raw_row;
    const invoiceNumber = clean(row.invoice_number ?? row.invoice_id);
    const sourceId = clean(row.invoice_id);
    const workOrderNumber = clean(row.work_order_number);

    try {
      const issued = date(row.invoice_date);
      if (!issued || !invoiceNumber) {
        const reason = !issued
          ? "Invalid or missing invoice_date."
          : "Missing invoice_number or invoice_id.";
        counts.skipped++;
        sample.skippedRows.push({
          row: staged.row_number,
          reason,
          invoiceNumber,
          workOrderNumber,
        });
        await client
          .from("import_job_rows")
          .update({ status: "skipped", error_message: reason })
          .eq("id", staged.id);
        continue;
      }

      const existingHistoricalInvoice = await findHistoricalInvoice(
        client,
        job.shop_id,
        invoiceNumber,
        sourceId,
      );
      if (
        pendingInvoiceNumbers.has(invoiceNumber) &&
        !existingHistoricalInvoice
      ) {
        counts.skipped++;
        counts.duplicates++;
        const reason = "Duplicate invoice already exists in this import batch.";
        sample.skippedRows.push({
          row: staged.row_number,
          reason,
          invoiceNumber,
          workOrderNumber,
        });
        await client
          .from("import_job_rows")
          .update({ status: "skipped", error_message: reason })
          .eq("id", staged.id);
        continue;
      }

      const workOrder = workOrderNumber
        ? workOrdersByNumber.get(workOrderNumber.toLowerCase())
        : null;
      const vehicle =
        (clean(row.vehicle_id)
          ? (vehiclesById.get(clean(row.vehicle_id)!) ??
            vehiclesById.get(clean(row.vehicle_id)!.toLowerCase()))
          : null) ?? (vin(row.vin) ? vehiclesById.get(vin(row.vin)!) : null);
      const { customer, customerMatchSource, legacyCustomerId } =
        resolveInvoiceImportCustomer(row, customerLookupMaps);
      const fallbackCustomerId =
        vehicle?.customer_id ?? workOrder?.customer_id ?? null;
      const customerId = customer?.id ?? fallbackCustomerId;
      const vehicleId = vehicle?.id ?? workOrder?.vehicle_id ?? null;
      const customerMatchSourceResolved =
        customerMatchSource ??
        (vehicle?.customer_id
          ? "vehicle_customer_id"
          : workOrder?.customer_id
            ? "work_order_customer_id"
            : null);
      const vehicleMatchSource = vehicle
        ? clean(row.vehicle_id)
          ? "vehicle_id"
          : vin(row.vin)
            ? "vin"
            : null
        : workOrder?.vehicle_id
          ? "work_order_vehicle_id"
          : null;
      const total = num(row.total) ?? num(row.subtotal) ?? 0;
      const amountPaid = num(row.amount_paid) ?? 0;
      const status = normalizeInvoiceImportStatus(row);
      if (!status) {
        const reason =
          "Invoice status represents a credit/refund reversal and is not imported as an invoice.";
        counts.skipped++;
        sample.skippedRows.push({
          row: staged.row_number,
          reason,
          invoiceNumber,
          workOrderNumber,
          sourceStatus: clean(row.payment_status ?? row.status),
        });
        await client
          .from("import_job_rows")
          .update({ status: "skipped", error_message: reason })
          .eq("id", staged.id);
        continue;
      }

      if (
        !existingHistoricalInvoice &&
        (await hasLiveInvoiceNumberCollision(
          client,
          job.shop_id,
          invoiceNumber,
        ))
      ) {
        const reason = "live_invoice_number_collision";
        counts.skipped++;
        sample.skippedRows.push({
          row: staged.row_number,
          reason,
          invoiceNumber,
          workOrderNumber,
        });
        await client
          .from("import_job_rows")
          .update({ status: "skipped", error_message: reason })
          .eq("id", staged.id);
        continue;
      }

      pendingInvoiceNumbers.add(invoiceNumber);
      writes.push({
        stagedId: staged.id,
        rowNumber: staged.row_number,
        invoiceNumber,
        workOrderNumber,
        existingInvoiceId: existingHistoricalInvoice?.id ?? null,
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
          notes:
            [clean(row.description), clean(row.notes)]
              .filter(Boolean)
              .join("\n") || null,
          metadata: {
            imported: true,
            read_only: true,
            import_type: "invoice_csv",
            imported_invoice_id: sourceId,
            legacy_customer_id: legacyCustomerId,
            legacy_vehicle_id: clean(row.vehicle_id),
            matched_customer_id: customerId,
            matched_vehicle_id: vehicleId,
            customer_match_source: customerMatchSourceResolved,
            vehicle_match_source: vehicleMatchSource,
            source_system: clean(row.source_system),
            work_order_number: workOrderNumber,
            vehicle_id: vehicleId,
            vin: clean(row.vin),
            service_category: clean(row.service_category),
            labor_hours: num(row.labor_hours),
            shop_supplies: num(row.shop_supplies),
            amount_paid: amountPaid,
            balance_due:
              num(row.balance_due) ?? Math.max(0, total - amountPaid),
            advisor: clean(row.advisor),
            technician: clean(row.technician),
            raw_row: row,
          } as DB["public"]["Tables"]["invoices"]["Insert"]["metadata"],
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Invoice row failed to import.";
      counts.failed++;
      sample.failedRows.push({
        row: staged.row_number,
        error: message,
        invoiceNumber,
        workOrderNumber,
      });
      await client
        .from("import_job_rows")
        .update({ status: "failed", error_message: message })
        .eq("id", staged.id);
    }
  }

  for (const batch of chunkArray(writes, batchSize)) {
    for (const entry of batch) {
      const write = entry.existingInvoiceId
        ? supabase
            .from("invoices")
            .update(entry.payload)
            .eq("id", entry.existingInvoiceId)
        : supabase.from("invoices").insert(entry.payload);
      const { error: rowError } = await write;

      if (rowError) {
        if (
          !entry.existingInvoiceId &&
          isInvoiceNumberUniqueConflict(rowError)
        ) {
          counts.skipped++;
          counts.duplicates++;
          const reason = "live_invoice_number_collision";
          sample.skippedRows.push({
            row: entry.rowNumber,
            reason,
            invoiceNumber: entry.invoiceNumber,
            workOrderNumber: entry.workOrderNumber,
          });
          await client
            .from("import_job_rows")
            .update({ status: "skipped", error_message: reason })
            .eq("id", entry.stagedId);
        } else {
          counts.failed++;
          sample.failedRows.push({
            row: entry.rowNumber,
            error: rowError.message,
            invoiceNumber: entry.invoiceNumber,
            workOrderNumber: entry.workOrderNumber,
          });
          await client
            .from("import_job_rows")
            .update({ status: "failed", error_message: rowError.message })
            .eq("id", entry.stagedId);
        }
      } else {
        counts.imported++;
        await client
          .from("import_job_rows")
          .update({ status: "imported" })
          .eq("id", entry.stagedId);
      }
    }
  }

  const processedRows = (job.processed_rows ?? 0) + rows.length;
  const summary = {
    skippedRows: sample.skippedRows.slice(0, INVOICE_IMPORT_SAMPLE_LIMIT),
    failedRows: sample.failedRows.slice(0, INVOICE_IMPORT_SAMPLE_LIMIT),
    duplicates: Number(job.summary?.duplicates ?? 0) + counts.duplicates,
  };
  const [
    { count: queuedCount },
    { count: importedCount },
    { count: skippedCount },
    { count: failedCount },
  ] = await Promise.all([
    client
      .from("import_job_rows")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "queued"),
    client
      .from("import_job_rows")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "imported"),
    client
      .from("import_job_rows")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "skipped"),
    client
      .from("import_job_rows")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "failed"),
  ]);
  const completed = (queuedCount ?? 0) === 0;
  const reconciledImported =
    importedCount ?? (job.imported_count ?? 0) + counts.imported;
  const reconciledSkipped =
    skippedCount ?? (job.skipped_count ?? 0) + counts.skipped;
  const reconciledFailed =
    failedCount ?? (job.failed_count ?? 0) + counts.failed;
  const reconciledProcessed =
    reconciledImported + reconciledSkipped + reconciledFailed;
  const reconcilesToTotal =
    reconciledProcessed === (job.total_rows ?? reconciledProcessed);

  await client
    .from("import_jobs")
    .update({
      status: completed ? "completed" : "processing",
      processed_rows: completed ? reconciledProcessed : processedRows,
      imported_count: reconciledImported,
      skipped_count: reconciledSkipped,
      failed_count: reconciledFailed,
      summary: {
        ...summary,
        accounting: {
          imported: reconciledImported,
          skipped: reconciledSkipped,
          failed: reconciledFailed,
          processed: reconciledProcessed,
          totalRows: job.total_rows ?? reconciledProcessed,
          reconcilesToTotal,
          note: "Historical invoice_csv reruns refresh existing imported rows; live invoice number collisions are counted as skipped rows.",
        },
      },
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return { ok: true, processed: rows.length, completed, job: { id: job.id } };
}
