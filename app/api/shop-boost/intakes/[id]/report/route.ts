import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildCanonicalIntakeTruth } from "@/features/integrations/shopBoost/canonicalTruth";
import {
  getLatestRunAttemptSummary,
  getRunByShopIntake,
  getRunJobs,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;
type RouteContext = { params: Promise<{ id: string }> };
type IntakeReportRow = Pick<
  DB["public"]["Tables"]["shop_boost_intakes"]["Row"],
  "id" | "shop_id" | "status" | "created_at" | "processed_at" | "intake_basics"
>;
const REPORT_DOMAINS = ["customer", "vehicle", "work_order", "history", "invoice", "part"] as const;
const REPORT_STATUSES = ["pending", "failed_materialization", "materialized", "ignored", "resolved"] as const;

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
  const canonicalTruth = await buildCanonicalIntakeTruth({
    admin: admin as any,
    shopId: profile.shop_id,
    intakeId: id,
  });

  const [reviewStatusCounts, reviewActionCounts, domainProcessedCounts, domainReviewCounts, domainFailedCounts] = await Promise.all([
    Promise.all(
      REPORT_STATUSES.map((status) =>
        admin
          .from("shop_boost_review_items")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", profile.shop_id)
          .eq("intake_id", id)
          .eq("status", status),
      ),
    ),
    Promise.all(
      ["linked_to_existing", "created_new", "ignored"].map((action) =>
        admin
          .from("shop_boost_review_items")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", profile.shop_id)
          .eq("intake_id", id)
          .eq("resolution_action", action),
      ),
    ),
    Promise.all(
      REPORT_DOMAINS.map((domain) =>
        admin
          .from("shop_boost_row_results")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", profile.shop_id)
          .eq("intake_id", id)
          .eq("target_domain", domain),
      ),
    ),
    Promise.all(
      REPORT_DOMAINS.map((domain) =>
        admin
          .from("shop_boost_row_results")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", profile.shop_id)
          .eq("intake_id", id)
          .eq("target_domain", domain)
          .eq("review_required", true),
      ),
    ),
    Promise.all(
      REPORT_DOMAINS.map((domain) =>
        admin
          .from("shop_boost_row_results")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", profile.shop_id)
          .eq("intake_id", id)
          .eq("target_domain", domain)
          .or("error_reason.not.is.null,match_status.eq.invalid"),
      ),
    ),
  ]);
  if (
    reviewStatusCounts.some((row) => row.error) ||
    reviewActionCounts.some((row) => row.error) ||
    domainProcessedCounts.some((row) => row.error) ||
    domainReviewCounts.some((row) => row.error) ||
    domainFailedCounts.some((row) => row.error)
  ) {
    console.error("[shop-boost][intakes/report] failed to load report aggregates", {
      intakeId: id,
      shopId: profile.shop_id,
      reviewRowsError: reviewStatusCounts.find((row) => row.error)?.error?.message ?? null,
      byDomainRowsError: domainProcessedCounts.find((row) => row.error)?.error?.message ?? null,
    });
  }

  const reviewOutcomes = REPORT_STATUSES.reduce((acc: Record<string, number>, status, index) => {
    acc[`status:${status}`] = Number(reviewStatusCounts[index]?.count ?? 0);
    return acc;
  }, {});
  (["linked_to_existing", "created_new", "ignored"] as const).forEach((action, index) => {
    reviewOutcomes[`action:${action}`] = Number(reviewActionCounts[index]?.count ?? 0);
  });
  reviewOutcomes["action:none"] = Math.max(
    0,
    (reviewOutcomes["status:pending"] ?? 0) - (reviewOutcomes["action:linked_to_existing"] ?? 0) - (reviewOutcomes["action:created_new"] ?? 0) - (reviewOutcomes["action:ignored"] ?? 0),
  );

  const domainSummaries = REPORT_DOMAINS.reduce((acc: Record<string, { review: number; failed: number; processed: number }>, domain, index) => {
    acc[domain] = {
      processed: Number(domainProcessedCounts[index]?.count ?? 0),
      review: Number(domainReviewCounts[index]?.count ?? 0),
      failed: Number(domainFailedCounts[index]?.count ?? 0),
    };
    return acc;
  }, {});

  const legacyOrchestrator = asRecord(basics.orchestrator);
  let orchestrator: Record<string, unknown> | null = null;
  try {
    const run = await getRunByShopIntake({ shopId: profile.shop_id, intakeId: intake.id });
    if (run?.id) {
      const jobs = await getRunJobs(run.id);
      const verifyJob = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");
      const activateJob = jobs.find((job) => job.job_type === "activate" && String(job.domain ?? "global") === "global");
      const verifyResult = asRecord(verifyJob?.result);
      const domains = asRecord(verifyResult.domains);
      const canonicalSummary = asRecord(verifyResult.canonicalSummary);
      const stateModel = asRecord(verifyResult.stateModel);
      const verifyStatus = String(verifyResult.verifyStatus ?? "partial");
      const verifyPassed = verifyResult.verifyPassed === true;
      const activationEligible = run.activation_status === "eligible" || run.activation_status === "activated";
      const activated = run.activation_status === "activated";
      const uiShouldRouteForward = verifyPassed && activationEligible;
      const jobSummary = await summarizeRunJobs(run.id);
      const jobSummaryDetailed = await summarizeRunJobsDetailed(run.id);
      const lastAttempt = await getLatestRunAttemptSummary(run.id);
      orchestrator = {
        runId: run.id,
        runState: run.state,
        verifyStatus,
        verifyPassed,
        activationStatus: run.activation_status,
        blockers: run.activation_blockers ?? [],
        canonicalSummary,
        domainPassCount: Number(domains.passCount ?? 0),
        domainFailCount: Number(domains.failCount ?? 0),
        domainPendingCount: Number(domains.pendingCount ?? 0),
        truthStates: {
          snapshot_complete: Boolean(verifyJob),
          import_complete: Boolean(stateModel.import_complete),
          canonical_ready: Boolean(stateModel.canonical_ready),
          activation_eligible: activationEligible,
          activated,
        },
        uiShouldRouteForward,
        jobSummary,
        jobSummaryDetailed,
        lastAttempt,
        run_id: run.id,
        state: run.state,
        activation_status: run.activation_status,
        activation_blockers: run.activation_blockers ?? [],
        activation_snapshot: asRecord(run.activation_snapshot),
        verify_result: verifyResult,
        verify_status: verifyStatus,
        verify_passed: verifyPassed,
        canonical_summary: canonicalSummary,
        domain_pass_count: Number(domains.passCount ?? 0),
        domain_fail_count: Number(domains.failCount ?? 0),
        domain_pending_count: Number(domains.pendingCount ?? 0),
        truth_states: {
          snapshot_complete: Boolean(verifyJob),
          import_complete: Boolean(stateModel.import_complete),
          canonical_ready: Boolean(stateModel.canonical_ready),
          activation_eligible: activationEligible,
          activated,
        },
        ui_should_route_forward: uiShouldRouteForward,
        activate_job_status: activateJob?.status ?? null,
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
      review_queue: canonicalTruth.rowCounts.unresolved,
      likely_blockers: canonicalTruth.rowCounts.failed + canonicalTruth.rowCounts.mismatch,
    },
    trust_statement: {
      confidence_score: asNumber(migrationProgress.confidenceScore ?? basics.confidence_score),
      message:
        "Based on your uploaded data and conservative shop patterns. Actual value depends on activation, data cleanup, and team adoption.",
    },
    review_outcomes: reviewOutcomes,
    canonical_truth: canonicalTruth,
    orchestrator,
    readiness: {
      snapshot_complete: Boolean(asRecord(orchestrator ?? {}).truthStates ? asRecord(asRecord(orchestrator ?? {}).truthStates).snapshot_complete : false),
      import_complete: Boolean(asRecord(orchestrator ?? {}).truthStates ? asRecord(asRecord(orchestrator ?? {}).truthStates).import_complete : false),
      canonical_ready: Boolean(asRecord(orchestrator ?? {}).truthStates ? asRecord(asRecord(orchestrator ?? {}).truthStates).canonical_ready : false),
      activation_eligible: Boolean(asRecord(orchestrator ?? {}).truthStates ? asRecord(asRecord(orchestrator ?? {}).truthStates).activation_eligible : false),
      activated: Boolean(asRecord(orchestrator ?? {}).truthStates ? asRecord(asRecord(orchestrator ?? {}).truthStates).activated : false),
      ui_should_route_forward: Boolean(asRecord(orchestrator ?? {}).uiShouldRouteForward ?? asRecord(orchestrator ?? {}).ui_should_route_forward ?? false),
    },
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
