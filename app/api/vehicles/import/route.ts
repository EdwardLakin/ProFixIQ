import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  VEHICLE_IMPORT_MAX_ROWS,
  VEHICLE_IMPORT_SAMPLE_LIMIT,
  VEHICLE_IMPORT_STAGING_BATCH_SIZE,
  chunkArray,
  stageVehicleImportRows,
  type VehicleImportRow,
} from "@/features/vehicles/server/vehicle-import-job";
type ImportJobInsert = Record<string, unknown>;

type JobInsertBuilder = {
  insert(values: ImportJobInsert): {
    select(columns: string): {
      single(): Promise<{ data: { id: string; total_rows: number | null; status: string | null } | null; error: SupabaseError | null }>;
    };
  };
};

type SupabaseError = Error & { code?: string; details?: string; hint?: string };

type RowInsertBuilder = {
  insert(values: Array<Record<string, unknown>>): Promise<{ error: SupabaseError | null }>;
};

type LooseSupabase<T> = { from(table: string): T };

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;

    const body = await req.json().catch(() => null);
    const rows = Array.isArray(body?.rows) ? (body.rows as VehicleImportRow[]) : [];
    if (!rows.length) {
      return NextResponse.json({ error: "No vehicle rows provided." }, { status: 400 });
    }
    if (rows.length > VEHICLE_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        { error: `Vehicle CSV contains ${rows.length} rows. Please split files into ${VEHICLE_IMPORT_MAX_ROWS} rows or fewer.` },
        { status: 400 },
      );
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "No active shop is selected." }, { status: 400 });
    }

    const sourceRef = `staging://import_job_rows/vehicles/${shopId}/${Date.now()}`;
    const jobPayload: ImportJobInsert = {
      shop_id: shopId,
      created_by: profile.id,
      import_type: "vehicles",
      status: "queued",
      total_rows: rows.length,
      processed_rows: 0,
      imported_count: 0,
      skipped_count: 0,
      failed_count: 0,
      source_storage_path: sourceRef,
      summary: {
        ok: true,
        counts: { created: 0, updated: 0, skipped: 0, failed: 0, duplicates: 0 },
        totalRows: rows.length,
        skippedRows: [],
        failedRows: [],
        sampleLimit: VEHICLE_IMPORT_SAMPLE_LIMIT,
        storageCleanup: "CSV rows are staged in import_job_rows; no Supabase Storage object is created.",
      },
    };

    const { data: job, error: jobError } = await (supabase as unknown as LooseSupabase<JobInsertBuilder>)
      .from("import_jobs")
      .insert(jobPayload)
      .select("id, total_rows, status")
      .single();
    if (jobError) {
      console.error("[vehicle-import:job-create-failed]", {
        message: jobError.message,
        code: jobError.code,
        details: jobError.details,
        hint: jobError.hint,
        jobPayload,
      });
      throw jobError;
    }
    if (!job?.id) throw new Error("Vehicle import job could not be created.");

    const stagedRows = stageVehicleImportRows(job.id, shopId, rows);
    for (const batch of chunkArray(stagedRows, VEHICLE_IMPORT_STAGING_BATCH_SIZE)) {
      const { error } = await (supabase as unknown as LooseSupabase<RowInsertBuilder>)
        .from("import_job_rows")
        .insert(batch);
      if (error) {
        console.error("[vehicle-import:rows-stage-failed]", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          jobId: job.id,
          batchSize: batch.length,
          sampleRow: batch[0],
        });
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      job: { id: job.id, status: job.status, totalRows: job.total_rows ?? rows.length },
      explanation: `Vehicle import job queued with ${rows.length} row(s).`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to queue vehicle import.",
        details: typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details : undefined,
        code: typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined,
        hint: typeof error === "object" && error && "hint" in error ? (error as { hint?: unknown }).hint : undefined,
      },
      { status: 500 },
    );
  }
}
