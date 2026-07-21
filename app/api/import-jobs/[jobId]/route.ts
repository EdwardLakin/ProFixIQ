import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  processVehicleHistoryImportJobBatch,
  VEHICLE_HISTORY_IMPORT_BATCH_SIZE,
} from "@/features/work-orders/server/vehicle-history-import-job";
import {
  INVOICE_IMPORT_BATCH_SIZE,
  processInvoiceImportJobBatch,
} from "@/features/billing/server/invoice-import-job";
import {
  INSPECTION_FORM_IMPORT_BATCH_SIZE,
  processInspectionFormImportJobBatch,
} from "@/features/inspections/server/inspection-form-import-job";

type ImportJobApiRow = {
  id: string;
  import_type: string | null;
  status: string | null;
  total_rows: number | null;
  processed_rows: number | null;
  imported_count: number | null;
  skipped_count: number | null;
  failed_count: number | null;
  error_message: string | null;
  summary: unknown;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

type ImportJobApiQuery = {
  select(columns: string): ImportJobApiQuery;
  eq(column: string, value: string): ImportJobApiQuery;
  single(): Promise<{ data: ImportJobApiRow | null; error: Error | null }>;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId)
    return NextResponse.json(
      { error: "No active shop is selected." },
      { status: 400 },
    );

  const loadJob = () =>
    (
      access.supabase as unknown as {
        from: (table: "import_jobs") => ImportJobApiQuery;
      }
    )
      .from("import_jobs")
      .select(
        "id, import_type, status, total_rows, processed_rows, imported_count, skipped_count, failed_count, error_message, summary, created_at, updated_at, completed_at",
      )
      .eq("id", jobId)
      .eq("shop_id", shopId)
      .single();

  let { data } = await loadJob();

  if (!data) {
    return NextResponse.json(
      { error: "Import job not found." },
      { status: 404 },
    );
  }

  if (data.status === "queued" || data.status === "processing") {
    if (data.import_type === "vehicle_history") {
      await processVehicleHistoryImportJobBatch(
        createAdminSupabase(),
        jobId,
        VEHICLE_HISTORY_IMPORT_BATCH_SIZE,
      );
      const refreshed = await loadJob();
      data = refreshed.data ?? data;
    } else if (data.import_type === "invoices") {
      await processInvoiceImportJobBatch(
        createAdminSupabase(),
        jobId,
        INVOICE_IMPORT_BATCH_SIZE,
      );
      const refreshed = await loadJob();
      data = refreshed.data ?? data;
    } else if (data.import_type === "inspection_form") {
      await processInspectionFormImportJobBatch(
        createAdminSupabase(),
        jobId,
        INSPECTION_FORM_IMPORT_BATCH_SIZE,
      );
      const refreshed = await loadJob();
      data = refreshed.data ?? data;
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: data.id,
      importType: data.import_type,
      status: data.status,
      totalRows: data.total_rows ?? 0,
      processedRows: data.processed_rows ?? 0,
      importedCount: data.imported_count ?? 0,
      skippedCount: data.skipped_count ?? 0,
      failedCount: data.failed_count ?? 0,
      errorMessage: data.error_message ?? null,
      summary: data.summary ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
    },
  });
}
