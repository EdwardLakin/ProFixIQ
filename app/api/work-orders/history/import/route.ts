import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { chunkArray, parseCsvFileFromFormData } from "@/features/shared/lib/import/csv";
import {
  VEHICLE_HISTORY_IMPORT_MAX_ROWS,
  VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT,
} from "@/features/work-orders/server/vehicle-history-import-job";
import type { Database } from "@shared/types/types/supabase";

type HistoryImportRow = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;
type JobInsertBuilder = {
  insert: (payload: unknown) => {
    select: (columns: string) => {
      single: () => Promise<{
        data: { id: string; total_rows: number; status: string } | null;
        error: Error | null;
      }>;
    };
  };
};
type RowInsertBuilder = {
  insert: (payload: unknown) => Promise<{ error: Error | null }>;
};
type LooseSupabase<TBuilder> = { from: (table: string) => TBuilder };

type ImportJobInsert = {
  shop_id: string;
  created_by: string;
  import_type: "vehicle_history";
  status: "queued";
  total_rows: number;
  processed_rows: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  source_storage_path: string;
  summary: JsonRecord;
};

const STAGING_INSERT_BATCH_SIZE = 500;

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });
    if (!access.ok) return access.response;

    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error:
            "Vehicle history import requires multipart/form-data with a CSV file field.",
        },
        { status: 415 },
      );
    }

    const formData = await req.formData().catch((error) => {
      throw new Error(
        error instanceof Error
          ? `Unable to read CSV upload: ${error.message}`
          : "Unable to read CSV upload.",
      );
    });

    let parsed;
    try {
      parsed = await parseCsvFileFromFormData<HistoryImportRow>({
        formData,
        maxRows: VEHICLE_HISTORY_IMPORT_MAX_ROWS,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to parse vehicle history CSV.",
        },
        { status: 400 },
      );
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;
    if (!shopId) {
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );
    }

    const createdBy = profile.id;
    const sourceRef = `staging://import_job_rows/vehicle_history/${shopId}/${Date.now()}`;
    const jobPayload: ImportJobInsert = {
      shop_id: shopId,
      created_by: createdBy,
      import_type: "vehicle_history",
      status: "queued",
      total_rows: parsed.rows.length,
      processed_rows: 0,
      imported_count: 0,
      skipped_count: 0,
      failed_count: 0,
      source_storage_path: sourceRef,
      summary: {
        storageCleanup: "CSV rows are staged in import_job_rows with retention metadata; no Supabase Storage object is created.",
        sampleLimit: VEHICLE_HISTORY_IMPORT_SAMPLE_LIMIT,
        skippedRows: [],
        failedRows: [],
      },
    };

    const { data: job, error: jobError } = await (supabase as unknown as LooseSupabase<JobInsertBuilder>)
      .from("import_jobs")
      .insert(jobPayload)
      .select("id, total_rows, status")
      .single();

    if (jobError || !job) {
      throw jobError ?? new Error("Unable to create vehicle history import job.");
    }

    const stagedRows = parsed.rows.map((row, index) => ({
      job_id: job.id,
      shop_id: shopId,
      row_number: index + 1,
      raw_row: row as Database["public"]["Tables"]["history"]["Insert"]["source_payload"],
      status: "queued",
    }));

    for (const batch of chunkArray(stagedRows, STAGING_INSERT_BATCH_SIZE)) {
      const { error } = await (supabase as unknown as LooseSupabase<RowInsertBuilder>)
        .from("import_job_rows")
        .insert(batch);
      if (error) throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        jobId: job.id,
        status: job.status,
        totalRows: job.total_rows,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue vehicle history import.",
      },
      { status: 500 },
    );
  }
}
