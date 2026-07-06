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

function authorize(req: Request) {
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_IMPORT_JOBS_SECRET",
    headerName: "x-internal-import-jobs-secret",
    routeLabel: "internal/import-jobs/tick",
  });
}

async function run(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || undefined;
  const importType = url.searchParams.get("importType") ?? url.searchParams.get("type");
  const admin = createAdminSupabase();
  const result = importType === "invoices"
    ? await processInvoiceImportJobBatch(admin, jobId, INVOICE_IMPORT_BATCH_SIZE)
    : await processVehicleHistoryImportJobBatch(
        admin,
        jobId,
        VEHICLE_HISTORY_IMPORT_BATCH_SIZE,
      );
  return NextResponse.json(result);
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
