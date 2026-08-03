import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_IMPORT_TYPES = [
  "vehicle_history",
  "invoices",
  "inspection_form",
] as const;
const STALE_PROCESSING_JOB_MINUTES = 15;
type SupportedImportType = (typeof SUPPORTED_IMPORT_TYPES)[number];
type ImportJobDispatchRow = {
  id: string;
  import_type: string | null;
  status: string | null;
  processed_rows: number | null;
  updated_at: string | null;
};
type ImportJobDispatchClient = {
  from(table: "import_jobs"): {
    select(columns: string): ImportJobDispatchQuery;
    update(values: Record<string, unknown>): ImportJobDispatchMutation;
  };
};
type ImportJobDispatchQuery = {
  in(column: string, values: readonly string[]): ImportJobDispatchQuery;
  order(column: string, options: { ascending: boolean }): ImportJobDispatchQuery;
  limit(count: number): ImportJobDispatchQuery;
  eq(column: string, value: string): ImportJobDispatchQuery;
  lt(column: string, value: string): ImportJobDispatchQuery;
  gte(column: string, value: string): ImportJobDispatchQuery;
  maybeSingle(): Promise<{ data: ImportJobDispatchRow | null; error: Error | null }>;
};
type ImportJobDispatchMutation = {
  eq(column: string, value: string): ImportJobDispatchMutation;
  in(column: string, values: readonly string[]): ImportJobDispatchMutation;
};

type DispatchSelection = {
  job: ImportJobDispatchRow | null;
  staleFailedCount: number;
};

function isSupportedImportType(value: string | null | undefined): value is SupportedImportType {
  return SUPPORTED_IMPORT_TYPES.includes(value as SupportedImportType);
}

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { ok: true } as const;
  }

  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_IMPORT_JOBS_SECRET",
    headerName: "x-internal-import-jobs-secret",
    routeLabel: "internal/import-jobs/tick",
  });
}

function staleProcessingCutoff() {
  return new Date(Date.now() - STALE_PROCESSING_JOB_MINUTES * 60 * 1000).toISOString();
}

function selectDispatchColumns(query: { select(columns: string): ImportJobDispatchQuery }) {
  return query.select("id, import_type, status, processed_rows, updated_at");
}

async function failStaleProcessingJobs(admin: ReturnType<typeof createAdminSupabase>, cutoff: string) {
  const client = admin as unknown as ImportJobDispatchClient;
  const { data: staleJob, error: staleSelectError } = await selectDispatchColumns(client.from("import_jobs"))
    .eq("status", "processing")
    .in("import_type", [...SUPPORTED_IMPORT_TYPES])
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (staleSelectError) throw staleSelectError;
  if (!staleJob) return 0;

  // Inspection form imports are page-oriented and safe to retry. A serverless
  // invocation can stop after a page is claimed, so release stale page locks
  // and let the normal queue resume instead of failing the whole customer form.
  if (staleJob.import_type === "inspection_form") {
    const { error: rowsRecoveryError } = await admin
      .from("import_job_rows")
      .update({ status: "queued", error_message: null })
      .eq("job_id", staleJob.id)
      .eq("status", "processing");
    if (rowsRecoveryError) throw rowsRecoveryError;

    const { error: jobRecoveryError } = await admin
      .from("import_jobs")
      .update({
        status: "queued",
        error_message: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", staleJob.id)
      .eq("status", "processing");
    if (jobRecoveryError) throw jobRecoveryError;
    return 0;
  }

  await client
    .from("import_jobs")
    .update({
      status: "failed",
      error_message: `Import job was marked failed after no progress for ${STALE_PROCESSING_JOB_MINUTES} minutes.`,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", staleJob.id)
    .eq("status", "processing");
  return 1;
}

async function selectOldestJobByStatus(
  admin: ReturnType<typeof createAdminSupabase>,
  status: "queued" | "processing",
  jobId?: string,
  cutoff?: string,
) {
  let query = selectDispatchColumns((admin as unknown as ImportJobDispatchClient).from("import_jobs"))
    .eq("status", status)
    .in("import_type", [...SUPPORTED_IMPORT_TYPES])
    .order(status === "queued" ? "created_at" : "updated_at", { ascending: true })
    .limit(1);

  if (jobId) query = query.eq("id", jobId);
  if (status === "processing" && cutoff) query = query.gte("updated_at", cutoff);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function findDispatchJob(admin: ReturnType<typeof createAdminSupabase>, jobId?: string): Promise<DispatchSelection> {
  const cutoff = staleProcessingCutoff();
  const staleFailedCount = jobId ? 0 : await failStaleProcessingJobs(admin, cutoff);

  const queuedJob = await selectOldestJobByStatus(admin, "queued", jobId);
  if (queuedJob) return { job: queuedJob, staleFailedCount };

  const recentProcessingJob = await selectOldestJobByStatus(admin, "processing", jobId, cutoff);
  return { job: recentProcessingJob, staleFailedCount };
}

async function loadTargetJob(admin: ReturnType<typeof createAdminSupabase>, jobId: string) {
  const { data, error } = await selectDispatchColumns((admin as unknown as ImportJobDispatchClient).from("import_jobs"))
    .eq("id", jobId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function processImportType(
  admin: ReturnType<typeof createAdminSupabase>,
  importType: SupportedImportType,
  jobId?: string,
) {
  if (importType === "invoices") {
    return processInvoiceImportJobBatch(admin, jobId, INVOICE_IMPORT_BATCH_SIZE);
  }

  if (importType === "inspection_form") {
    return processInspectionFormImportJobBatch(
      admin,
      jobId,
      INSPECTION_FORM_IMPORT_BATCH_SIZE,
    );
  }

  return processVehicleHistoryImportJobBatch(
    admin,
    jobId,
    VEHICLE_HISTORY_IMPORT_BATCH_SIZE,
  );
}

function responseWithDispatchLog(
  result: Awaited<ReturnType<typeof processImportType>>,
  importType: SupportedImportType,
  selectedJob: ImportJobDispatchRow | null,
  staleFailedCount = 0,
) {
  return NextResponse.json({
    ...result,
    importType,
    dispatch: {
      selectedJobId: selectedJob?.id ?? result.job?.id ?? null,
      importType,
      priorStatus: selectedJob?.status ?? null,
      priorProcessedRows: selectedJob?.processed_rows ?? null,
      processed: result.processed,
      completed: result.completed,
      staleFailedCount,
    },
  });
}

async function run(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || undefined;
  const requestedImportType = url.searchParams.get("importType") ?? url.searchParams.get("type");
  const admin = createAdminSupabase();

  if (requestedImportType) {
    if (!isSupportedImportType(requestedImportType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported import_type: ${requestedImportType}`,
          supportedImportTypes: SUPPORTED_IMPORT_TYPES,
        },
        { status: 400 },
      );
    }

    const selectedJob = jobId ? await loadTargetJob(admin, jobId) : null;
    const result = await processImportType(admin, requestedImportType, jobId);
    return responseWithDispatchLog(result, requestedImportType, selectedJob);
  }

  const { job: dispatchJob, staleFailedCount } = await findDispatchJob(admin, jobId);
  if (!dispatchJob) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      completed: false,
      job: null,
      dispatch: {
        selectedJobId: null,
        importType: null,
        priorStatus: null,
        priorProcessedRows: null,
        processed: 0,
        completed: false,
        staleFailedCount,
      },
      supportedImportTypes: SUPPORTED_IMPORT_TYPES,
    });
  }

  if (!isSupportedImportType(dispatchJob.import_type)) {
    return NextResponse.json(
      {
        ok: false,
        processed: 0,
        completed: false,
        job: { id: dispatchJob.id },
        error: `Unsupported import_type: ${dispatchJob.import_type ?? "unknown"}`,
        supportedImportTypes: SUPPORTED_IMPORT_TYPES,
      },
      { status: 400 },
    );
  }

  const result = await processImportType(admin, dispatchJob.import_type, dispatchJob.id);
  return responseWithDispatchLog(result, dispatchJob.import_type, dispatchJob, staleFailedCount);
}

export async function GET(req: Request) {
  try {
    return await run(req);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import job tick failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
