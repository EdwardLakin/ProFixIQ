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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_IMPORT_TYPES = ["vehicle_history", "invoices"] as const;
type SupportedImportType = (typeof SUPPORTED_IMPORT_TYPES)[number];
type ImportJobDispatchRow = { id: string; import_type: string | null };
type ImportJobDispatchClient = {
  from(table: "import_jobs"): {
    select(columns: string): ImportJobDispatchQuery;
  };
};
type ImportJobDispatchQuery = {
  in(column: string, values: readonly string[]): ImportJobDispatchQuery;
  order(column: string, options: { ascending: boolean }): ImportJobDispatchQuery;
  limit(count: number): ImportJobDispatchQuery;
  eq(column: string, value: string): ImportJobDispatchQuery;
  maybeSingle(): Promise<{ data: ImportJobDispatchRow | null; error: Error | null }>;
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

async function findDispatchJob(admin: ReturnType<typeof createAdminSupabase>, jobId?: string) {
  let query = (admin as unknown as ImportJobDispatchClient)
    .from("import_jobs")
    .select("id, import_type")
    .in("status", ["queued", "processing"])
    .in("import_type", [...SUPPORTED_IMPORT_TYPES])
    .order("created_at", { ascending: true })
    .limit(1);

  if (jobId) query = query.eq("id", jobId);

  const { data, error } = await query.maybeSingle();
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

  return processVehicleHistoryImportJobBatch(
    admin,
    jobId,
    VEHICLE_HISTORY_IMPORT_BATCH_SIZE,
  );
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

    const result = await processImportType(admin, requestedImportType, jobId);
    return NextResponse.json({ ...result, importType: requestedImportType });
  }

  const dispatchJob = await findDispatchJob(admin, jobId);
  if (!dispatchJob) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      completed: false,
      job: null,
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
  return NextResponse.json({ ...result, importType: dispatchJob.import_type });
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
