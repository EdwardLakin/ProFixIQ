import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { toIntakeProgress } from "@/features/integrations/shopBoost/status";
import { buildCanonicalIntakeTruth } from "@/features/integrations/shopBoost/canonicalTruth";
import {
  getLatestRunAttemptSummaryWithDiagnostics,
  getRunByShopIntake,
  getRunJobs,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
} from "@/features/integrations/shopBoost/orchestrator";

type DB = Database;
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET() {
  const supabaseUser = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: authErr,
  } = await supabaseUser.auth.getUser();

  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null }>();

  if (!profile?.shop_id) {
    return NextResponse.json({ ok: false, error: "No shop linked." }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data: intake, error } = await admin
    .from("shop_boost_intakes")
    .select("id,shop_id,status,processed_at,created_at,intake_basics")
    .eq("shop_id", profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[shop-boost][intakes/latest] failed to load latest intake", {
      shopId: profile.shop_id,
      error: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!intake) return NextResponse.json({ ok: true, intake: null });

  const basics = asRecord(intake.intake_basics);
  const basicsOrchestrator = asRecord(basics.orchestrator);

  const canonicalTruth = await buildCanonicalIntakeTruth({
    admin: admin as any,
    shopId: profile.shop_id,
    intakeId: intake.id,
  });

  let orchestrator: Record<string, unknown> | null = null;
  const diagnostics: Array<{ scope: string; code: string; message: string; hint?: string }> = [];

  try {
    const run = await getRunByShopIntake({
      shopId: profile.shop_id,
      intakeId: intake.id,
    });

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
      const { summary: lastAttempt, diagnostics: attemptDiagnostics } = await getLatestRunAttemptSummaryWithDiagnostics(run.id);
      if (attemptDiagnostics) {
        diagnostics.push({
          scope: "orchestrator.lastAttempt",
          code: attemptDiagnostics.code,
          message: attemptDiagnostics.message,
          hint: attemptDiagnostics.hint,
        });
      }
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
        state: run.state,
        activationBlockers: run.activation_blockers ?? [],
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
        lastError:
          lastAttempt?.status === "failed" || lastAttempt?.errorMessage
            ? {
                code: lastAttempt?.errorCode ?? null,
                message: lastAttempt?.errorMessage ?? null,
              }
            : null,
      };
    }
  } catch (orchestratorErr) {
    console.error("[shop-boost/orchestrator] latest status enrichment failed", {
      shopId: profile.shop_id,
      intakeId: intake.id,
      error: orchestratorErr instanceof Error ? orchestratorErr.message : String(orchestratorErr),
    });
  }

  if (!orchestrator && Object.keys(basicsOrchestrator).length > 0) {
    orchestrator = {
      runId: basicsOrchestrator.run_id ?? null,
      runState: basicsOrchestrator.state ?? null,
      activationStatus: basicsOrchestrator.activation_status ?? null,
      verifyStatus: basicsOrchestrator.verify_status ?? null,
      verifyPassed: basicsOrchestrator.verify_passed ?? null,
      blockers: basicsOrchestrator.activation_blockers ?? [],
      canonicalSummary: basicsOrchestrator.canonical_summary ?? null,
      domainPassCount: basicsOrchestrator.domain_pass_count ?? null,
      domainFailCount: basicsOrchestrator.domain_fail_count ?? null,
      domainPendingCount: basicsOrchestrator.domain_pending_count ?? null,
      truthStates: basicsOrchestrator.truth_states ?? null,
      uiShouldRouteForward: basicsOrchestrator.ui_should_route_forward ?? null,
      jobSummary: basicsOrchestrator.job_summary ?? null,
      lastAttempt: basicsOrchestrator.last_attempt ?? null,
      state: basicsOrchestrator.state ?? null,
      activationBlockers: basicsOrchestrator.activation_blockers ?? [],
      jobs: basicsOrchestrator.job_summary ?? null,
      lastError: basicsOrchestrator.last_error ?? null,
    };
  }

  const orchestratorRecord = asRecord(orchestrator);
  const truthStates = asRecord(orchestratorRecord.truthStates ?? orchestratorRecord.truth_states);
  const canonicalReadyFromRun = Boolean(truthStates.canonical_ready);
  const canonicalReadyFromRows =
    canonicalTruth.rowCounts.total > 0 &&
    canonicalTruth.rowCounts.unresolved === 0 &&
    canonicalTruth.rowCounts.failed === 0 &&
    canonicalTruth.rowCounts.mismatch === 0;
  const canonicalReady = canonicalReadyFromRun && canonicalReadyFromRows;

  return NextResponse.json({
    ok: true,
    diagnostics,
    intake: {
      id: intake.id,
      status: intake.status,
      createdAt: intake.created_at,
      processedAt: intake.processed_at,
      progress: toIntakeProgress(intake as never),
      orchestrator,
      canonicalTruth,
      readiness: orchestrator
        ? {
            snapshot_complete: Boolean(truthStates.snapshot_complete),
            import_complete: Boolean(truthStates.import_complete),
            canonical_ready: canonicalReady,
            activation_eligible: Boolean(truthStates.activation_eligible) && canonicalReady,
            activated: Boolean(truthStates.activated),
            verify_status: orchestratorRecord.verifyStatus ?? orchestratorRecord.verify_status ?? null,
            verify_passed: orchestratorRecord.verifyPassed ?? orchestratorRecord.verify_passed ?? null,
            blockers: orchestratorRecord.blockers ?? orchestratorRecord.activation_blockers ?? [],
            domain_pass_count: orchestratorRecord.domainPassCount ?? orchestratorRecord.domain_pass_count ?? 0,
            domain_fail_count: orchestratorRecord.domainFailCount ?? orchestratorRecord.domain_fail_count ?? 0,
            domain_pending_count: orchestratorRecord.domainPendingCount ?? orchestratorRecord.domain_pending_count ?? 0,
            canonical_summary: orchestratorRecord.canonicalSummary ?? orchestratorRecord.canonical_summary ?? null,
            ui_should_route_forward: Boolean(orchestratorRecord.uiShouldRouteForward ?? orchestratorRecord.ui_should_route_forward ?? false) && canonicalReady,
          }
        : {
            snapshot_complete: false,
            import_complete: false,
            canonical_ready: canonicalReadyFromRows,
            activation_eligible: false,
            activated: false,
            verify_status: null,
            verify_passed: null,
            blockers: [],
            domain_pass_count: 0,
            domain_fail_count: 0,
            domain_pending_count: 0,
            canonical_summary: null,
            ui_should_route_forward: false,
          },
    },
  });
}
