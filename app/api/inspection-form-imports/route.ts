import { randomUUID } from "node:crypto";
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

type RelatedRecord = {
  id: string;
  name: string | null;
  business_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};
type UploadDescriptor = {
  path: string;
  originalName: string;
  mime: string;
  size: number;
};

const IMPORT_SETUP_ERROR =
  "Inspection form imports need the latest database update before they can be used.";

function clean(value: unknown, max = 160) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase() || "page.jpg";
}

function customerLabel(customer: {
  business_name: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  return (
    customer.business_name ||
    customer.name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    "Customer"
  );
}

function isImportSchemaError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}) {
  const detail = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return (
    ((error.code === "42703" || error.code === "PGRST204") &&
      (detail.includes("result_record_id") ||
        detail.includes("approved_at"))) ||
    (error.code === "23514" && detail.includes("import_jobs_import_type_check"))
  );
}

async function removeUploadedPages(
  admin: ReturnType<typeof createAdminSupabase>,
  uploads: UploadDescriptor[],
) {
  if (!uploads.length) return;
  const { error } = await admin.storage
    .from(BUCKET)
    .remove(uploads.map((upload) => upload.path));
  if (error) {
    console.error("inspection form staged page cleanup failed", {
      paths: uploads.map((upload) => upload.path),
      error: error.message,
    });
  }
}

function validateFileDescriptor(value: unknown, index: number) {
  if (!value || typeof value !== "object") return null;
  const input = value as {
    name?: unknown;
    originalName?: unknown;
    size?: unknown;
    type?: unknown;
    mime?: unknown;
    path?: unknown;
  };
  const originalName = clean(
    String(input.name ?? input.originalName ?? ""),
    180,
  );
  const mime = clean(String(input.type ?? input.mime ?? ""), 80).toLowerCase();
  const size = Number(input.size);
  const path = clean(String(input.path ?? ""), 500);
  if (
    !originalName ||
    !Number.isFinite(size) ||
    size < 1 ||
    size > MAX_FILE_BYTES
  ) {
    return null;
  }
  if (!ALLOWED_MIME_TYPES.has(mime)) return null;
  return { originalName, mime, size, path, index };
}

async function loadRelatedRecord(
  supabase: SupabaseClient<Database>,
  table: "customers" | "fleets",
  id: string,
  shopId: string,
) {
  if (!id) return null;
  const columns =
    table === "customers"
      ? "id, name, business_name, first_name, last_name"
      : "id, name";
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

  const admin = createAdminSupabase();
  const [jobsResult, customersResult, fleetsResult] = await Promise.all([
    admin
      .from("import_jobs")
      .select(
        "id, status, total_rows, processed_rows, error_message, summary, result_record_id, created_at, updated_at, approved_at",
      )
      .eq("shop_id", access.profile.shop_id)
      .eq("import_type", "inspection_form")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("customers")
      .select("id, name, business_name, first_name, last_name")
      .eq("shop_id", access.profile.shop_id)
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("fleets")
      .select("id, name")
      .eq("shop_id", access.profile.shop_id)
      .order("name", { ascending: true })
      .limit(500),
  ]);

  if (customersResult.error || fleetsResult.error) {
    console.error("inspection form import directory load failed", {
      customers: customersResult.error?.message,
      fleets: fleetsResult.error?.message,
      shopId: access.profile.shop_id,
    });
    return NextResponse.json(
      { error: "Unable to load form imports." },
      { status: 500 },
    );
  }

  if (jobsResult.error) {
    console.error("inspection form recent import load failed", {
      code: jobsResult.error.code,
      error: jobsResult.error.message,
      shopId: access.profile.shop_id,
    });
  }

  return NextResponse.json({
    ok: true,
    importReady: !jobsResult.error,
    setupError: jobsResult.error
      ? isImportSchemaError(jobsResult.error)
        ? IMPORT_SETUP_ERROR
        : "Unable to verify the form import service. Please try again."
      : null,
    customers: (customersResult.data ?? [])
      .map((customer) => ({ id: customer.id, label: customerLabel(customer) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    fleets: (fleetsResult.data ?? []).map((fleet) => ({
      id: fleet.id,
      label: fleet.name,
    })),
    imports: (jobsResult.data ?? []).map((job) => {
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

  const shopId = access.profile.shop_id;
  const admin = createAdminSupabase();
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as {
      action?: unknown;
      files?: unknown;
      uploads?: unknown;
      uploadId?: unknown;
      title?: unknown;
      vehicleType?: unknown;
      dutyClass?: unknown;
      customerId?: unknown;
      customerName?: unknown;
      fleetId?: unknown;
      fleetName?: unknown;
    } | null;

    if (body?.action === "prepare") {
      const { error: schemaError } = await admin
        .from("import_jobs")
        .select("result_record_id, approved_at")
        .limit(0);
      if (schemaError) {
        console.error("inspection form import schema readiness check failed", {
          code: schemaError.code,
          error: schemaError.message,
          shopId,
        });
        return NextResponse.json(
          {
            error: isImportSchemaError(schemaError)
              ? IMPORT_SETUP_ERROR
              : "Unable to verify the form import service. Please try again.",
          },
          { status: 503 },
        );
      }

      const values = Array.isArray(body.files) ? body.files : [];
      if (!values.length || values.length > MAX_PAGES) {
        return NextResponse.json(
          { error: `Choose between 1 and ${MAX_PAGES} form pages.` },
          { status: 400 },
        );
      }
      const descriptors = values.map(validateFileDescriptor);
      if (descriptors.some((file) => !file)) {
        return NextResponse.json(
          {
            error: "Every page must be a supported image no larger than 25 MB.",
          },
          { status: 400 },
        );
      }

      const uploadId = randomUUID();
      const uploads: Array<UploadDescriptor & { token: string }> = [];
      for (const descriptor of descriptors) {
        if (!descriptor) continue;
        const path = `${access.profile.id}/${uploadId}/${String(descriptor.index + 1).padStart(2, "0")}-${safeFileName(descriptor.originalName)}`;
        const { data, error } = await admin.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (error || !data?.token) {
          console.error("inspection form signed upload preparation failed", {
            shopId,
            uploadId,
            error: error?.message,
          });
          return NextResponse.json(
            {
              error: "Unable to prepare secure page uploads. Please try again.",
            },
            { status: 500 },
          );
        }
        uploads.push({
          path,
          token: data.token,
          originalName: descriptor.originalName,
          mime: descriptor.mime,
          size: descriptor.size,
        });
      }
      return NextResponse.json({ ok: true, uploadId, uploads });
    }

    if (body?.action !== "finalize") {
      return NextResponse.json(
        { error: "Invalid upload action." },
        { status: 400 },
      );
    }

    const uploadId = clean(body.uploadId, 60);
    const values = Array.isArray(body.uploads) ? body.uploads : [];
    const descriptors = values.map(validateFileDescriptor);
    if (
      !/^[0-9a-f-]{36}$/i.test(uploadId) ||
      !values.length ||
      values.length > MAX_PAGES ||
      descriptors.some((file) => !file)
    ) {
      return NextResponse.json(
        { error: "The prepared upload is invalid or expired." },
        { status: 400 },
      );
    }
    const expectedPrefix = `${access.profile.id}/${uploadId}/`;
    const uploads = descriptors.filter(
      (value): value is NonNullable<typeof value> => Boolean(value),
    );
    if (uploads.some((upload) => !upload.path.startsWith(expectedPrefix))) {
      return NextResponse.json(
        { error: "The prepared upload does not belong to this user." },
        { status: 403 },
      );
    }
    const { data: stored, error: listError } = await admin.storage
      .from(BUCKET)
      .list(`${access.profile.id}/${uploadId}`, { limit: MAX_PAGES + 1 });
    const storedNames = new Set((stored ?? []).map((item) => item.name));
    if (
      listError ||
      uploads.some(
        (upload) => !storedNames.has(upload.path.split("/").at(-1) ?? ""),
      )
    ) {
      return NextResponse.json(
        { error: "One or more pages did not finish uploading. Please retry." },
        { status: 409 },
      );
    }

    return queueInspectionFormImport({
      admin,
      jobId: uploadId,
      shopId,
      actorId: access.profile.id,
      uploads,
      metadata: body,
    });
  }

  // Compatibility for the legacy single-request uploader. New clients use
  // signed, direct-to-storage uploads so mobile camera files never cross the
  // hosting provider's request-size limit.
  const formData = await req.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);
  if (!files.length || files.length > MAX_PAGES) {
    return NextResponse.json(
      { error: `Add between 1 and ${MAX_PAGES} form pages.` },
      { status: 400 },
    );
  }
  const descriptors = files.map((file, index) =>
    validateFileDescriptor(
      {
        name: file.name,
        type: file.type,
        size: file.size,
      },
      index,
    ),
  );
  if (descriptors.some((file) => !file)) {
    return NextResponse.json(
      { error: "Every page must be a supported image no larger than 25 MB." },
      { status: 400 },
    );
  }

  const jobId = randomUUID();
  const uploaded: UploadDescriptor[] = [];
  try {
    for (let index = 0; index < files.length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor) continue;
      const path = `${access.profile.id}/${jobId}/${String(index + 1).padStart(2, "0")}-${safeFileName(descriptor.originalName)}`;
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, files[index], {
          contentType: descriptor.mime,
          upsert: false,
        });
      if (error) throw error;
      uploaded.push({
        path,
        originalName: descriptor.originalName,
        mime: descriptor.mime,
        size: descriptor.size,
      });
    }
  } catch (error) {
    if (uploaded.length)
      await admin.storage
        .from(BUCKET)
        .remove(uploaded.map((item) => item.path));
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to upload the form pages.",
      },
      { status: 500 },
    );
  }

  return queueInspectionFormImport({
    admin,
    jobId,
    shopId,
    actorId: access.profile.id,
    uploads: uploaded.map((upload, index) => ({ ...upload, index })),
    metadata: {
      title: formData.get("title"),
      vehicleType: formData.get("vehicleType"),
      dutyClass: formData.get("dutyClass"),
      customerId: formData.get("customerId"),
      customerName: formData.get("customerName"),
      fleetId: formData.get("fleetId"),
      fleetName: formData.get("fleetName"),
    },
  });
}

async function queueInspectionFormImport({
  admin,
  jobId,
  shopId,
  actorId,
  uploads,
  metadata,
}: {
  admin: ReturnType<typeof createAdminSupabase>;
  jobId: string;
  shopId: string;
  actorId: string;
  uploads: Array<UploadDescriptor & { index: number }>;
  metadata: Record<string, unknown>;
}) {
  const customerId = clean(metadata.customerId, 60);
  const fleetId = clean(metadata.fleetId, 60);
  const [customer, fleet] = await Promise.all([
    loadRelatedRecord(admin, "customers", customerId, shopId),
    loadRelatedRecord(admin, "fleets", fleetId, shopId),
  ]);
  if (customerId && !customer) {
    await removeUploadedPages(admin, uploads);
    return NextResponse.json(
      { error: "Customer not found in this shop." },
      { status: 404 },
    );
  }
  if (fleetId && !fleet) {
    await removeUploadedPages(admin, uploads);
    return NextResponse.json(
      { error: "Fleet account not found in this shop." },
      { status: 404 },
    );
  }

  const summary = {
    state: "queued",
    title: clean(metadata.title) || "Imported Inspection Form",
    vehicleType: clean(metadata.vehicleType, 30),
    dutyClass: clean(metadata.dutyClass, 20),
    customerId: customer?.id ?? null,
    customerName: customer
      ? customer.business_name ||
        customer.name ||
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        clean(metadata.customerName) ||
        null
      : clean(metadata.customerName) || null,
    fleetId: fleet?.id ?? null,
    fleetName: fleet?.name ?? (clean(metadata.fleetName) || null),
    draftSections: [],
    extractedText: "",
    failedPages: [],
  };

  const { error: jobError } = await admin.from("import_jobs").insert({
    id: jobId,
    shop_id: shopId,
    created_by: actorId,
    import_type: "inspection_form",
    status: "queued",
    total_rows: uploads.length,
    summary,
  });
  if (jobError) {
    await removeUploadedPages(admin, uploads);
    console.error("inspection form import job creation failed", {
      jobId,
      shopId,
      code: jobError.code,
      error: jobError.message,
    });
    return NextResponse.json(
      {
        error: isImportSchemaError(jobError)
          ? IMPORT_SETUP_ERROR
          : "Unable to start the form import. Please try again.",
      },
      { status: isImportSchemaError(jobError) ? 503 : 500 },
    );
  }

  const { error: rowsError } = await admin.from("import_job_rows").insert(
    uploads.map((upload, index) => ({
      job_id: jobId,
      shop_id: shopId,
      row_number: index + 1,
      status: "queued",
      raw_row: {
        storagePath: upload.path,
        originalName: upload.originalName,
        mime: upload.mime,
      },
    })),
  );
  if (rowsError) {
    await admin
      .from("import_jobs")
      .delete()
      .eq("id", jobId)
      .eq("shop_id", shopId);
    await removeUploadedPages(admin, uploads);
    console.error("inspection form import page staging failed", {
      jobId,
      shopId,
      error: rowsError.message,
    });
    return NextResponse.json(
      { error: "Unable to stage the uploaded form pages." },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await processInspectionFormImportJobBatch(
        createAdminSupabase(),
        jobId,
        INSPECTION_FORM_IMPORT_BATCH_SIZE,
      );
    } catch (error) {
      console.error("inspection form import background kickoff failed", {
        jobId,
        error,
      });
    }
  });

  return NextResponse.json(
    { ok: true, jobId, status: "queued" },
    { status: 202 },
  );
}
