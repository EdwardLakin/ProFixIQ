import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  normalizeInspectionFormImportSummary,
  normalizeInspectionFormSections,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";
import { replaceFleetTireSectionWithGrid } from "@/features/inspections/lib/fleet/replaceFleetTireSectionWithGrid";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose } from "@/features/shared/lib/server/openai-models";

type DB = Database;

export const INSPECTION_FORM_IMPORT_BATCH_SIZE = 2;
const BUCKET = "fleet-forms";

type JobRow = {
  id: string;
  shop_id: string;
  total_rows: number;
  processed_rows: number;
  imported_count: number;
  failed_count: number;
  summary: unknown;
};

type PagePayload = {
  storagePath: string;
  originalName: string;
  mime: string;
  extractedText?: string;
  parsedSections?: InspectionFormSection[];
};

type StagedPage = {
  id: string;
  row_number: number;
  raw_row: PagePayload;
  status: string;
  error_message: string | null;
};

type VisionResult = {
  extracted_text?: unknown;
  sections?: unknown;
};

function asPagePayload(value: unknown): PagePayload | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const storagePath = String(row.storagePath ?? "").trim();
  const originalName = String(row.originalName ?? "").trim();
  const mime = String(row.mime ?? "").trim();
  if (!storagePath || !originalName || !mime) return null;
  return {
    storagePath,
    originalName,
    mime,
    extractedText:
      typeof row.extractedText === "string" ? row.extractedText : undefined,
    parsedSections: normalizeInspectionFormSections(row.parsedSections),
  };
}

async function parsePage(
  supabase: SupabaseClient<DB>,
  page: PagePayload,
  hints: ReturnType<typeof normalizeInspectionFormImportSummary>,
) {
  const { data: file, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(page.storagePath);
  if (downloadError || !file) {
    throw new Error(downloadError?.message || "Uploaded page could not be read.");
  }

  const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
  const completion = await getOpenAIClient().chat.completions.create({
    model: getOpenAIModelForPurpose("vision"),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You perform OCR on vehicle inspection forms. Return strict JSON only and preserve every visible section and checklist row.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Read this single page of a customer vehicle inspection form.",
              'Return {"extracted_text":"...","sections":[{"title":"...","items":[{"item":"...","unit":null}]}]}.',
              "Keep printed order. Include fill-in fields and measurement rows. Do not invent content.",
              `Vehicle type hint: ${hints.vehicleType || "unknown"}`,
              `Duty class hint: ${hints.dutyClass || "unknown"}`,
              `Template title hint: ${hints.title || "unknown"}`,
            ].join("\n"),
          },
          {
            type: "image_url",
            image_url: { url: `data:${page.mime};base64,${bytes}` },
          },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("The form reader returned no result.");

  const result = JSON.parse(content) as VisionResult;
  const sections = normalizeInspectionFormSections(result.sections);
  if (!sections.length) {
    throw new Error("No readable inspection rows were found on this page.");
  }

  return {
    extractedText:
      typeof result.extracted_text === "string"
        ? result.extracted_text.trim()
        : "",
    parsedSections: sections,
  };
}

async function finalizeJob(
  client: SupabaseClient,
  job: JobRow,
  hints: ReturnType<typeof normalizeInspectionFormImportSummary>,
) {
  const { data, error } = await client
    .from("import_job_rows")
    .select("id, row_number, raw_row, status, error_message")
    .eq("job_id", job.id)
    .order("row_number", { ascending: true });
  if (error) throw error;

  const pages = (data ?? []) as StagedPage[];
  const successful = pages.filter((page) => page.status === "imported");
  const failedPages = pages
    .filter((page) => page.status === "failed")
    .map((page) => ({
      page: page.row_number,
      message: page.error_message || "This page could not be read.",
    }));

  const sections = successful.flatMap((page) => {
    const payload = asPagePayload(page.raw_row);
    return payload?.parsedSections ?? [];
  });
  const draftSections = replaceFleetTireSectionWithGrid({
    sections,
    vehicleType: hints.vehicleType,
    dutyClass:
      hints.dutyClass === "light" ||
      hints.dutyClass === "medium" ||
      hints.dutyClass === "heavy"
        ? hints.dutyClass
        : "",
  });
  const extractedText = successful
    .map((page) => asPagePayload(page.raw_row)?.extractedText || "")
    .filter(Boolean)
    .join("\n\n");

  if (!draftSections.length) {
    await client
      .from("import_jobs")
      .update({
        status: "failed",
        failed_count: failedPages.length || pages.length,
        error_message: "No uploaded pages contained readable inspection rows.",
        completed_at: new Date().toISOString(),
        summary: { ...hints, state: "failed", failedPages },
      })
      .eq("id", job.id);
    return { completed: true, failed: true };
  }

  await client
    .from("import_jobs")
    .update({
      status: "completed",
      imported_count: successful.length,
      failed_count: failedPages.length,
      error_message: null,
      completed_at: new Date().toISOString(),
      summary: {
        ...hints,
        state: "ready_for_review",
        draftSections,
        extractedText,
        failedPages,
      },
    })
    .eq("id", job.id);
  return { completed: true, failed: false };
}

export async function processInspectionFormImportJobBatch(
  supabase: SupabaseClient<DB>,
  jobId?: string,
  batchSize = INSPECTION_FORM_IMPORT_BATCH_SIZE,
) {
  const client = supabase as unknown as SupabaseClient;
  let jobQuery = client
    .from("import_jobs")
    .select(
      "id, shop_id, total_rows, processed_rows, imported_count, failed_count, summary",
    )
    .eq("import_type", "inspection_form")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (jobId) jobQuery = jobQuery.eq("id", jobId);

  const { data: jobData, error: jobError } =
    await jobQuery.maybeSingle<JobRow>();
  if (jobError) throw jobError;
  if (!jobData) {
    return { ok: true, processed: 0, completed: false, job: null };
  }

  const job = jobData;
  const hints = normalizeInspectionFormImportSummary(job.summary);
  await client
    .from("import_jobs")
    .update({
      status: "processing",
      summary: { ...hints, state: "processing" },
    })
    .eq("id", job.id)
    .in("status", ["queued", "processing"]);

  const { data: pageData, error: pageError } = await client
    .from("import_job_rows")
    .select("id, row_number, raw_row, status, error_message")
    .eq("job_id", job.id)
    .eq("status", "queued")
    .order("row_number", { ascending: true })
    .limit(batchSize);
  if (pageError) throw pageError;

  const pages = (pageData ?? []) as StagedPage[];
  if (!pages.length) {
    const { count: activePageCount, error: activePageError } = await client
      .from("import_job_rows")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "processing");
    if (activePageError) throw activePageError;
    if ((activePageCount ?? 0) > 0) {
      return { ok: true, processed: 0, completed: false, job: { id: job.id } };
    }
    const final = await finalizeJob(client, job, hints);
    return { ok: !final.failed, processed: 0, completed: true, job: { id: job.id } };
  }

  let claimedCount = 0;
  for (const staged of pages) {
    const { data: claimed, error: claimError } = await client
      .from("import_job_rows")
      .update({ status: "processing", error_message: null })
      .eq("id", staged.id)
      .eq("status", "queued")
      .select("id, row_number, raw_row, status, error_message")
      .maybeSingle<StagedPage>();
    if (claimError) throw claimError;
    if (!claimed) continue;
    claimedCount += 1;

    const page = asPagePayload(claimed.raw_row);
    if (!page) {
      await client
        .from("import_job_rows")
        .update({ status: "failed", error_message: "Page metadata is invalid." })
        .eq("id", claimed.id)
        .eq("status", "processing");
      continue;
    }

    try {
      const parsed = await parsePage(supabase, page, hints);
      await client
        .from("import_job_rows")
        .update({
          status: "imported",
          error_message: null,
          raw_row: { ...page, ...parsed },
        })
        .eq("id", claimed.id)
        .eq("status", "processing");
    } catch (error) {
      await client
        .from("import_job_rows")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "This page could not be read.",
        })
        .eq("id", claimed.id)
        .eq("status", "processing");
    }
  }

  const { data: terminalRows, error: countError } = await client
    .from("import_job_rows")
    .select("status")
    .eq("job_id", job.id)
    .in("status", ["imported", "failed", "skipped"]);
  if (countError) throw countError;
  const terminalStatuses = (terminalRows ?? []) as Array<{ status: string }>;
  const processedRows = terminalStatuses.length;
  const importedRows = terminalStatuses.filter(
    (row) => row.status === "imported",
  ).length;
  const failedRows = terminalStatuses.filter(
    (row) => row.status === "failed",
  ).length;
  await client
    .from("import_jobs")
    .update({
      processed_rows: processedRows,
      imported_count: importedRows,
      failed_count: failedRows,
    })
    .eq("id", job.id);

  if (processedRows >= job.total_rows) {
    const final = await finalizeJob(client, job, hints);
    return {
      ok: !final.failed,
      processed: claimedCount,
      completed: true,
      job: { id: job.id },
    };
  }

  return {
    ok: true,
    processed: claimedCount,
    completed: false,
    job: { id: job.id },
  };
}
