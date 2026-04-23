import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  getLatestRunAttemptSummary,
  getRunByShopIntake,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;
type RouteContext = { params: Promise<{ id: string }> };
type ReviewOutcomeRow = Pick<
  DB["public"]["Tables"]["shop_boost_review_items"]["Row"],
  "status" | "resolution_action"
>;
type DomainAggregationRow = Pick<
  DB["public"]["Tables"]["shop_boost_row_results"]["Row"],
  "target_domain" | "review_required" | "error_reason"
>;
type IntakeReportRow = Pick<
  DB["public"]["Tables"]["shop_boost_intakes"]["Row"],
  "id" | "shop_id" | "status" | "created_at" | "processed_at" | "intake_basics"
>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function renderPdf(report: Record<string, unknown>): Promise<Buffer> {
  const pdfKitModule = await import("pdfkit");
  const PDFDocument = pdfKitModule.default as unknown as new (options: { margin: number }) => {
    on: (event: string, handler: (chunk?: Uint8Array) => void) => void;
    fontSize: (size: number) => { text: (value: string) => void };
    text: (value: string) => void;
    moveDown: (value: number) => void;
    end: () => void;
  };

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk ?? [])));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Shop Boost Analysis Report");
    doc.moveDown(0.8);
    doc.fontSize(11).text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(1.2);

    const roi = asRecord(report.roi_summary);
    const impact = asRecord(report.impact_comparison);
    const blockers = asRecord(report.blockers);
    const trust = asRecord(report.trust_statement);

    doc.fontSize(13).text("ROI summary");
    doc.fontSize(10).text(`Estimated monthly impact: $${asNumber(roi.estimated_monthly_impact).toLocaleString()}`);
    doc.text(`Approval speed gain: ${asNumber(roi.approval_speed_gain)}%`);
    doc.text(`Labor recovery: ${asNumber(roi.labor_recovery_hours)} hrs/month`);
    doc.moveDown(1);

    doc.fontSize(13).text("Before vs after");
    doc.fontSize(10).text(`Approval rate: ${asNumber(asRecord(impact.before).approval_rate)}% → ${asNumber(asRecord(impact.after).approval_rate)}%`);
    doc.text(`Avg completion: ${asNumber(asRecord(impact.before).avg_job_completion_time)}d → ${asNumber(asRecord(impact.after).avg_job_completion_time)}d`);
    doc.text(`Parts sync: ${asNumber(asRecord(impact.before).parts_sync_rate)}% → ${asNumber(asRecord(impact.after).parts_sync_rate)}%`);
    doc.moveDown(1);

    doc.fontSize(13).text("Blockers");
    doc.fontSize(10).text(`Review queue: ${asNumber(blockers.review_queue)}`);
    doc.text(`Likely blockers: ${asNumber(blockers.likely_blockers)}`);
    doc.moveDown(1);

    doc.fontSize(13).text("Trust statement");
    doc.fontSize(10).text(String(trust.message ?? "Projection is based on uploaded data and conservative assumptions."));
    doc.end();
  });
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user?.id) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });

  const admin = createAdminSupabase();
  const { data: intake, error } = await admin
    .from("shop_boost_intakes")
    .select("id,shop_id,status,created_at,processed_at,intake_basics")
    .eq("id", id)
    .eq("shop_id", profile.shop_id)
    .maybeSingle<IntakeReportRow>();

  if (error) {
    console.error("[shop-boost][intakes/report] failed to load intake", {
      intakeId: id,
      shopId: profile.shop_id,
      error: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!intake) return NextResponse.json({ ok: false, error: "Intake not found." }, { status: 404 });

  const basics = asRecord(intake.intake_basics);
  const migrationProgress = asRecord(basics.migrationProgress);
  const importSummary = asRecord(basics.importSummary);
  const integrity = asRecord(importSummary.integrity ?? migrationProgress.integrity);

  const [{ data: reviewRows, error: reviewRowsError }, { data: byDomainRows, error: byDomainRowsError }] = await Promise.all([
    admin
      .from("shop_boost_review_items")
      .select("status,resolution_action")
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", id),
    admin
      .from("shop_boost_row_results")
      .select("target_domain,review_required,error_reason")
      .eq("shop_id", profile.shop_id)
      .eq("intake_id", id),
  ]);
  if (reviewRowsError || byDomainRowsError) {
    console.error("[shop-boost][intakes/report] failed to load report aggregates", {
      intakeId: id,
      shopId: profile.shop_id,
      reviewRowsError: reviewRowsError?.message ?? null,
      byDomainRowsError: byDomainRowsError?.message ?? null,
    });
  }

  const reviewOutcomes = (reviewRows ?? []).reduce((acc: Record<string, number>, row: ReviewOutcomeRow) => {
    const status = String(row.status ?? "unknown");
    acc[`status:${status}`] = (acc[`status:${status}`] ?? 0) + 1;
    const action = String(row.resolution_action ?? "none");
    acc[`action:${action}`] = (acc[`action:${action}`] ?? 0) + 1;
    return acc;
  }, {});

  const domainSummaries = (byDomainRows ?? []).reduce((acc: Record<string, { review: number; failed: number; processed: number }>, row: DomainAggregationRow) => {
    const key = String(row.target_domain ?? "unknown");
    const next = acc[key] ?? { review: 0, failed: 0, processed: 0 };
    next.processed += 1;
    if (row.review_required) next.review += 1;
    if (row.error_reason) next.failed += 1;
    acc[key] = next;
    return acc;
  }, {});

  const legacyOrchestrator = asRecord(basics.orchestrator);
  let orchestrator: Record<string, unknown> | null = null;
  try {
    const run = await getRunByShopIntake({ shopId: profile.shop_id, intakeId: intake.id });
    if (run?.id) {
      const jobSummary = await summarizeRunJobs(run.id);
      const jobSummaryDetailed = await summarizeRunJobsDetailed(run.id);
      const lastAttempt = await getLatestRunAttemptSummary(run.id);
      orchestrator = {
        runId: run.id,
        runState: run.state,
        activationStatus: run.activation_status,
        blockers: run.activation_blockers ?? [],
        jobSummary,
        jobSummaryDetailed,
        lastAttempt,
        run_id: run.id,
        state: run.state,
        activation_status: run.activation_status,
        activation_blockers: run.activation_blockers ?? [],
        activation_snapshot: asRecord(run.activation_snapshot),
        jobs: jobSummary,
        jobsDetailed: jobSummaryDetailed,
        last_error:
          lastAttempt?.status === "failed" || lastAttempt?.errorMessage
            ? {
                code: lastAttempt?.errorCode ?? null,
                message: lastAttempt?.errorMessage ?? null,
              }
            : null,
      };
    }
  } catch (orchestratorErr) {
    console.error("[shop-boost/orchestrator] report enrichment failed", {
      intakeId: intake.id,
      shopId: profile.shop_id,
      error: orchestratorErr instanceof Error ? orchestratorErr.message : String(orchestratorErr),
    });
  }

  if (!orchestrator && Object.keys(legacyOrchestrator).length > 0) {
    orchestrator = {
      runId: legacyOrchestrator.run_id ?? null,
      runState: legacyOrchestrator.state ?? null,
      activationStatus: legacyOrchestrator.activation_status ?? null,
      blockers: legacyOrchestrator.activation_blockers ?? [],
      jobSummary: legacyOrchestrator.job_summary ?? null,
      lastAttempt: legacyOrchestrator.last_attempt ?? null,
      run_id: legacyOrchestrator.run_id ?? null,
      state: legacyOrchestrator.state ?? null,
      activation_status: legacyOrchestrator.activation_status ?? null,
      activation_blockers: legacyOrchestrator.activation_blockers ?? [],
      activation_snapshot: asRecord(legacyOrchestrator.activation_snapshot),
      jobs: legacyOrchestrator.job_summary ?? null,
      last_error: legacyOrchestrator.last_error ?? null,
    };
  }

  const report = {
    intake_id: intake.id,
    status: intake.status,
    created_at: intake.created_at,
    processed_at: intake.processed_at,
    migration_story: asRecord(basics.migration_story),
    domain_summaries: domainSummaries,
    integrity_results: {
      status: integrity.status ?? null,
      checks: asRecord(integrity.checks),
      integrity_errors: Array.isArray(integrity.integrity_errors) ? integrity.integrity_errors : [],
    },
    roi_summary: asRecord(migrationProgress.roi ?? basics.roi_summary),
    impact_comparison: asRecord(migrationProgress.impactComparison ?? basics.impact_comparison),
    blockers: {
      review_queue: asNumber(importSummary.reviewQueueCount ?? migrationProgress.reviewQueueCount),
      likely_blockers: asNumber(importSummary.blockerCount ?? migrationProgress.blockerCount),
    },
    trust_statement: {
      confidence_score: asNumber(migrationProgress.confidenceScore ?? basics.confidence_score),
      message:
        "Based on your uploaded data and conservative shop patterns. Actual value depends on activation, data cleanup, and team adoption.",
    },
    review_outcomes: reviewOutcomes,
    orchestrator,
  };

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const pdf = url.searchParams.get("pdf") === "1";
  if (pdf) {
    const pdfBuffer = await renderPdf(report as Record<string, unknown>);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"shop-boost-report-${intake.id}.pdf\"`,
      },
    });
  }
  if (download) {
    return new NextResponse(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=\"shop-boost-report-${intake.id}.json\"`,
      },
    });
  }

  return NextResponse.json({ ok: true, report });
}
