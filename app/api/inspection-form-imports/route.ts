import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  inspectionFormImportState,
  normalizeInspectionFormImportSummary,
} from "@/features/inspections/lib/form-import";
import {
  INSPECTION_FORM_IMPORT_BATCH_SIZE,
  processInspectionFormImportJobBatch,
} from "@/features/inspections/server/inspection-form-import-job";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "fleet-forms";
const MAX_PAGES = 12;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/tiff",
]);

type RelatedRecord = { id: string; name: string | null; business_name?: string | null };

function clean(value: FormDataEntryValue | null, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase() || "page.jpg";
}

async function loadRelatedRecord(
  supabase: SupabaseClient<Database>,
  table: "customers" | "fleets",
  id: string,
  shopId: string,
) {
  if (!id) return null;
  const columns = table === "customers" ? "id, name, business_name" : "id, name";
  const { data } = await supabase
    .from(table)
    .select(columns)
    .eq("id", id)
    .eq("shop_id", shopId)
    .maybeSingle();
  return (data as RelatedRecord | null) ?? null;
}

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "service"],
  });
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("import_jobs")
    .select(
      "id, status, total_rows, processed_rows, error_message, summary, result_record_id, created_at, updated_at, approved_at",
    )
    .eq("shop_id", access.profile.shop_id)
    .eq("import_type", "inspection_form")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Unable to load form imports." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    imports: (data ?? []).map((job) => {
      const summary = normalizeInspectionFormImportSummary(job.summary);
      return {
        id: job.id,
        status: job.status,
        state: inspectionFormImportState(job.status, job.summary),
        title: summary.title,
        customerName: summary.customerName,
        fleetName: summary.fleetName,
        totalPages: job.total_rows,
        processedPages: job.processed_rows,
        errorMessage: job.error_message,
        templateId: job.result_record_id,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        approvedAt: job.approved_at,
      };
    }),
  });
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "service"],
  });
  if (!access.ok) return access.response;

  const formData = await req.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);
  if (!files.length) {
    return NextResponse.json({ error: "Add at least one form page." }, { status: 400 });
  }
  if (files.length > MAX_PAGES) {
    return NextResponse.json(
      { error: `Upload ${MAX_PAGES} pages or fewer at a time.` },
      { status: 400 },
    );
  }

  for (const file of files) {
    if (!file.size || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name || "A page"} must be between 1 byte and 25 MB.` },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `${file.name || "A page"} is not a supported image.` },
        { status: 400 },
      );
    }
  }

  const shopId = access.profile.shop_id;
  const customerId = clean(formData.get("customerId"), 60);
  const fleetId = clean(formData.get("fleetId"), 60);
  const [customer, fleet] = await Promise.all([
    loadRelatedRecord(access.supabase, "customers", customerId, shopId),
    loadRelatedRecord(access.supabase, "fleets", fleetId, shopId),
  ]);
  if (customerId && !customer) {
    return NextResponse.json({ error: "Customer not found in this shop." }, { status: 404 });
  }
  if (fleetId && !fleet) {
    return NextResponse.json({ error: "Fleet account not found in this shop." }, { status: 404 });
  }

  const title = clean(formData.get("title")) || "Imported Inspection Form";
  const vehicleType = clean(formData.get("vehicleType"), 30);
  const dutyClass = clean(formData.get("dutyClass"), 20);
  const summary = {
    state: "queued",
    title,
    vehicleType,
    dutyClass,
    customerId: customer?.id ?? null,
    customerName: customer ? customer.business_name || customer.name : null,
    fleetId: fleet?.id ?? null,
    fleetName: fleet?.name ?? null,
    draftSections: [],
    extractedText: "",
    failedPages: [],
  };

  const admin = createAdminSupabase();
  const { data: job, error: jobError } = await admin
    .from("import_jobs")
    .insert({
      shop_id: shopId,
      created_by: access.profile.id,
      import_type: "inspection_form",
      status: "queued",
      total_rows: files.length,
      summary,
    })
    .select("id")
    .single();
  if (jobError || !job?.id) {
    return NextResponse.json({ error: "Unable to start the form import." }, { status: 500 });
  }

  const uploadedPaths: string[] = [];
  try {
    const stagedRows: Array<Record<string, unknown>> = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const storagePath = `${access.profile.id}/${job.id}/${String(index + 1).padStart(2, "0")}-${safeFileName(file.name)}`;
      const { error: uploadError } = await access.supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      stagedRows.push({
        job_id: job.id,
        shop_id: shopId,
        row_number: index + 1,
        status: "queued",
        raw_row: {
          storagePath,
          originalName: file.name,
          mime: file.type,
        },
      });
    }

    const { error: rowsError } = await admin.from("import_job_rows").insert(stagedRows);
    if (rowsError) throw rowsError;
  } catch (error) {
    if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
    await admin.from("import_jobs").delete().eq("id", job.id).eq("shop_id", shopId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload the form pages." },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await processInspectionFormImportJobBatch(
        createAdminSupabase(),
        job.id,
        INSPECTION_FORM_IMPORT_BATCH_SIZE,
      );
    } catch (error) {
      console.error("inspection form import background kickoff failed", {
        jobId: job.id,
        error,
      });
    }
  });

  return NextResponse.json(
    { ok: true, jobId: job.id, status: "queued" },
    { status: 202 },
  );
}
