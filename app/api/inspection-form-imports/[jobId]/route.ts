import { after, NextResponse } from "next/server";

import {
  inspectionFormImportState,
  normalizeInspectionFormImportSummary,
  normalizeInspectionFormContext,
  normalizeImportGridPlan,
  refineInspectionFormContext,
  normalizeInspectionFormSections,
} from "@/features/inspections/lib/form-import";
import {
  applyImportGrids,
  detectImportGridPlan,
} from "@/features/inspections/lib/fleet/importGrids";
import {
  INSPECTION_FORM_IMPORT_BATCH_SIZE,
  processInspectionFormImportJobBatch,
} from "@/features/inspections/server/inspection-form-import-job";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

async function loadJob(jobId: string) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "service"],
  });
  if (!access.ok) return { access, job: null } as const;

  const { data } = await access.supabase
    .from("import_jobs")
    .select(
      "id, status, total_rows, processed_rows, error_message, summary, result_record_id, created_at, updated_at, approved_at",
    )
    .eq("id", jobId)
    .eq("shop_id", access.profile.shop_id)
    .eq("import_type", "inspection_form")
    .maybeSingle();
  return { access, job: data ?? null } as const;
}

export async function GET(_req: Request, context: Context) {
  const { jobId } = await context.params;
  const loaded = await loadJob(jobId);
  if (!loaded.access.ok) return loaded.access.response;
  if (!loaded.job) {
    return NextResponse.json({ error: "Form import not found." }, { status: 404 });
  }

  const { job } = loaded;
  const summary = normalizeInspectionFormImportSummary(job.summary);
  const state = inspectionFormImportState(job.status, job.summary);
  if (state === "queued" || state === "processing") {
    after(async () => {
      try {
        await processInspectionFormImportJobBatch(
          createAdminSupabase(),
          job.id,
          INSPECTION_FORM_IMPORT_BATCH_SIZE,
        );
      } catch (error) {
        console.error("inspection form import poll kickoff failed", {
          jobId: job.id,
          error,
        });
      }
    });
  }

  // An import still awaiting review is offered the grids that fit its form.
  // Imports read before grids existed have no saved plan, so it is derived
  // here; saving the review persists it. Approved imports are left as saved.
  let draftSections = summary.draftSections;
  let gridPlan = summary.gridPlan;
  let gridDetection: {
    reasons: string[];
    sourceHasTireMeasurements: boolean;
    sourceHasBrakeMeasurements: boolean;
  } | null = null;
  if (state === "ready_for_review") {
    const detection = detectImportGridPlan({
      sections: draftSections,
      vehicleType: summary.vehicleType,
      dutyClass: summary.dutyClass,
      title: summary.title,
      extractedText: summary.extractedText,
    });
    gridDetection = {
      reasons: detection.reasons,
      sourceHasTireMeasurements: detection.sourceHasTireMeasurements,
      sourceHasBrakeMeasurements: detection.sourceHasBrakeMeasurements,
    };
    if (!gridPlan) {
      gridPlan = {
        tireGrid: detection.tireGrid,
        brakeGrid: detection.brakeGrid,
        brakeMode: detection.brakeMode,
      };
      draftSections = applyImportGrids(draftSections, gridPlan, {
        vehicleType: summary.vehicleType,
        extractedText: summary.extractedText,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    import: {
      id: job.id,
      status: job.status,
      state,
      title: summary.title,
      vehicleType: summary.vehicleType,
      dutyClass: summary.dutyClass,
      customerId: summary.customerId,
      customerName: summary.customerName,
      fleetId: summary.fleetId,
      fleetName: summary.fleetName,
      draftSections,
      gridPlan,
      gridDetection,
      // Reshaped on read so imports parsed before the certification and noise
      // rules existed open in the corrected order; saving persists it.
      formContext: refineInspectionFormContext(summary.formContext),
      extractedText: summary.extractedText,
      failedPages: summary.failedPages,
      totalPages: job.total_rows,
      processedPages: job.processed_rows,
      errorMessage: job.error_message,
      templateId: job.result_record_id,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      approvedAt: job.approved_at,
    },
  });
}

export async function PATCH(req: Request, context: Context) {
  const { jobId } = await context.params;
  const loaded = await loadJob(jobId);
  if (!loaded.access.ok) return loaded.access.response;
  if (!loaded.job) {
    return NextResponse.json({ error: "Form import not found." }, { status: 404 });
  }
  if (loaded.job.status !== "completed" || loaded.job.result_record_id) {
    return NextResponse.json(
      { error: "Only a ready, unapproved import can be edited." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { title?: unknown; sections?: unknown; formContext?: unknown; gridPlan?: unknown }
    | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 160) : "";
  const sections = normalizeInspectionFormSections(body?.sections);
  if (!title || !sections.length) {
    return NextResponse.json(
      { error: "A title and at least one section are required." },
      { status: 400 },
    );
  }

  const current = normalizeInspectionFormImportSummary(loaded.job.summary);
  // A reviewer can move a row the reader misfiled as header or signature
  // content back into the checklist, so the preserved context is editable too.
  // Leaving it out of the request keeps whatever the reader produced.
  const formContext =
    body?.formContext === undefined
      ? current.formContext
      : refineInspectionFormContext(normalizeInspectionFormContext(body.formContext));
  const gridPlan =
    body?.gridPlan === undefined
      ? current.gridPlan
      : normalizeImportGridPlan(body.gridPlan);
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("import_jobs")
    .update({
      summary: { ...current, title, draftSections: sections, formContext, gridPlan },
    })
    .eq("id", jobId)
    .eq("shop_id", loaded.access.profile.shop_id)
    .eq("import_type", "inspection_form")
    .eq("status", "completed")
    .is("result_record_id", null);
  if (error) {
    return NextResponse.json({ error: "Unable to save the review." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title, sections, formContext, gridPlan });
}
