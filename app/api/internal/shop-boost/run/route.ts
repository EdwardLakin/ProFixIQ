// app/api/internal/shop-boost/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { updateIntakeProgress } from "@/features/integrations/shopBoost/status";
import {
  ensureRun,
  getLatestRunAttemptSummary,
  getRunJobs,
  markRunRetryable,
  markRunRunning,
  markRunSucceeded,
  seedRunJobs,
  summarizeRunJobs,
  summarizeRunJobsDetailed,
  type ActivationEvaluationResult,
} from "@/features/integrations/shopBoost/orchestrator";
import { executeShopBoostRun } from "@/features/integrations/shopBoost/orchestrator/executeRun";
import { type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";

const SHOP_BOOST_SECRET = process.env.SHOP_BOOST_SECRET ?? "";

type RunBody = {
  shopId?: string;
  intakeId?: string;
  runId?: string;
  runImport?: boolean;
  maxRuns?: number;
  maxPasses?: number;
  triggerSource?: string;
};

type WorkerRunTarget = {
  runId: string;
  shopId: string;
  intakeId: string;
};

const DEFAULT_MAX_RUNS = 3;
const DEFAULT_MAX_PASSES = 12;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asImportSummary(value: unknown): ShopBoostImportSummary | null {
  const rec = asRecord(value);
  return Object.keys(rec).length ? (rec as unknown as ShopBoostImportSummary) : null;
}

async function resolveRunTargets(admin: ReturnType<typeof createAdminSupabase>, body: RunBody): Promise<WorkerRunTarget[]> {
  if (body.runId) {
    const { data } = await admin
      .from("shop_onboarding_runs")
      .select("id,shop_id,intake_id")
      .eq("id", body.runId)
      .maybeSingle<{ id: string; shop_id: string; intake_id: string }>();
    return data ? [{ runId: data.id, shopId: data.shop_id, intakeId: data.intake_id }] : [];
  }

  if (body.intakeId && body.shopId) {
    const run = await ensureRun({ shopId: body.shopId, intakeId: body.intakeId, triggerSource: "cron" });
    return run?.id ? [{ runId: run.id, shopId: body.shopId, intakeId: body.intakeId }] : [];
  }

  if (body.intakeId) {
    const { data } = await admin
      .from("shop_onboarding_runs")
      .select("id,shop_id,intake_id")
      .eq("intake_id", body.intakeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; shop_id: string; intake_id: string }>();
    return data ? [{ runId: data.id, shopId: data.shop_id, intakeId: data.intake_id }] : [];
  }

  const now = new Date().toISOString();
  const candidateQuery = admin
    .from("shop_onboarding_jobs")
    .select("run_id,shop_id,intake_id,retry_after")
    .in("status", ["queued", "retryable_failed"])
    .order("priority", { ascending: true })
    .limit(Math.max(1, Math.min(body.maxRuns ?? DEFAULT_MAX_RUNS, 10)) * 8);

  const { data } = body.shopId ? await candidateQuery.eq("shop_id", body.shopId) : await candidateQuery;
  const unique = new Map<string, WorkerRunTarget>();
  for (const row of data ?? []) {
    const retryAfter = row.retry_after as string | null;
    if (retryAfter && retryAfter > now) continue;
    const runId = String(row.run_id ?? "");
    const shopId = String(row.shop_id ?? "");
    const intakeId = String(row.intake_id ?? "");
    if (!runId || !shopId || !intakeId || unique.has(runId)) continue;
    unique.set(runId, { runId, shopId, intakeId });
  }
  return [...unique.values()];
}

export async function POST(req: NextRequest) {
  // Canonical executor route: claim runnable jobs and execute bounded worker passes.
  if (!SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "SHOP_BOOST_SECRET not configured" }, { status: 500 });
  }

  const headerSecret = req.headers.get("x-shop-boost-secret") ?? req.headers.get("X-Shop-Boost-Secret");

  if (!headerSecret || headerSecret !== SHOP_BOOST_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RunBody | null;

  const admin = createAdminSupabase();
  const targets = await resolveRunTargets(admin, body ?? {});
  if (!targets.length) {
    return NextResponse.json({
      ok: true,
      runsTouched: 0,
      jobsClaimed: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      jobsRetried: 0,
      remainingRunnableJobs: 0,
      message: "No runnable jobs",
    });
  }

  const allowImport = body?.runImport !== false;
  const maxPasses = Math.max(1, Math.min(body?.maxPasses ?? DEFAULT_MAX_PASSES, 50));
  const maxRuns = Math.max(1, Math.min(body?.maxRuns ?? DEFAULT_MAX_RUNS, 10));
  const selectedTargets = targets.slice(0, maxRuns);

  const touchedRuns: string[] = [];
  let jobsClaimed = 0;
  let jobsCompleted = 0;
  let jobsFailed = 0;
  let jobsRetried = 0;
  const errors: string[] = [];

  for (const target of selectedTargets) {
    await seedRunJobs({ runId: target.runId, shopId: target.shopId, intakeId: target.intakeId });
    await markRunRunning(target.runId, "profiling");

    const before = await summarizeRunJobs(target.runId);
    const beforeRunning = Number(before?.running ?? 0);
    const beforeQueued = Number(before?.queued ?? 0);
    const beforeRetryable = Number(before?.retryable_failed ?? 0);

    const execution = await executeShopBoostRun({
      runId: target.runId,
      shopId: target.shopId,
      intakeId: target.intakeId,
      maxPasses,
      workerPrefix: `internal-shop-boost:${body?.triggerSource ?? "internal"}`,
      allowImport,
    });

    touchedRuns.push(target.runId);
    errors.push(...execution.errors);

    const jobs = await getRunJobs(target.runId);
    const materializeJob = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "customers");
    const verifyJob = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");
    const verifyResult = asRecord(verifyJob?.result);
    const latestImportSummary = execution.latestImportSummary ?? asImportSummary(materializeJob?.result);
    const latestActivationEval =
      execution.latestActivationEval ??
      ({
        activationStatus: String(asRecord(verifyJob?.result).activationStatus ?? "blocked") as ActivationEvaluationResult["activationStatus"],
        blockers: Array.isArray(asRecord(verifyJob?.result).blockers)
          ? (asRecord(verifyJob?.result).blockers as unknown[]).map((v) => String(v))
          : [],
        snapshot: asRecord(asRecord(verifyJob?.result).snapshot),
      } satisfies ActivationEvaluationResult);

    const jobSummary = await summarizeRunJobs(target.runId);
    const jobSummaryDetailed = await summarizeRunJobsDetailed(target.runId);
    const lastAttempt = await getLatestRunAttemptSummary(target.runId);
    const hasPending = Number(jobSummary?.queued ?? 0) + Number(jobSummary?.running ?? 0) + Number(jobSummary?.retryable_failed ?? 0) > 0;
    const hasErrors =
      execution.errors.length > 0 ||
      Number(jobSummary?.blocked_manual ?? 0) > 0 ||
      Number(jobSummary?.terminal_failed ?? 0) > 0 ||
      Number(jobSummary?.retryable_failed ?? 0) > 0;

    const verifyPassed = verifyResult.verifyPassed === true;
    const uiShouldRouteForward =
      verifyPassed && (latestActivationEval.activationStatus === "activated" || latestActivationEval.activationStatus === "eligible");
    const truthStates = {
      snapshot_complete: Boolean(verifyJob),
      import_complete: verifyResult.stateModel && typeof verifyResult.stateModel === "object" ? Boolean(asRecord(verifyResult.stateModel).import_complete) : false,
      canonical_ready: verifyResult.stateModel && typeof verifyResult.stateModel === "object" ? Boolean(asRecord(verifyResult.stateModel).canonical_ready) : false,
      activation_eligible: verifyResult.stateModel && typeof verifyResult.stateModel === "object" ? Boolean(asRecord(verifyResult.stateModel).activation_eligible) : false,
      activated: latestActivationEval.activationStatus === "activated",
    };

    const status = hasPending ? "processing" : hasErrors ? "completed_with_errors" : "completed";
    const progressPercent = hasPending ? 65 : 100;
    await updateIntakeProgress({
      intakeId: target.intakeId,
      status,
      currentStep: hasPending ? "worker_processing" : "completed",
      progressPercent,
      patch: {
        completedAt: hasPending ? null : new Date().toISOString(),
        failedAt: null,
        lastError: execution.errors.join(" ") || null,
        orchestrator: {
          run_id: target.runId,
          state: status,
          activation_status: latestActivationEval.activationStatus,
          activation_blockers: latestActivationEval.blockers,
          activation_snapshot: latestActivationEval.snapshot,
          verify_result: verifyResult,
          verify_status: String(verifyResult.verifyStatus ?? "partial"),
          verify_passed: verifyPassed,
          truth_states: truthStates,
          ui_should_route_forward: uiShouldRouteForward,
          job_summary: jobSummary,
          job_summary_detailed: jobSummaryDetailed,
          last_attempt: lastAttempt,
          runState: status,
          activationStatus: latestActivationEval.activationStatus,
          blockers: latestActivationEval.blockers,
          verifyResult,
          verifyStatus: String(verifyResult.verifyStatus ?? "partial"),
          verifyPassed,
          truthStates,
          uiShouldRouteForward,
          jobSummary,
          jobSummaryDetailed,
          lastAttempt,
          updated_at: new Date().toISOString(),
        },
      },
    });

    if (hasPending && execution.errors.length > 0) {
      const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await markRunRetryable(target.runId, "PROCESS_STEP_FAILED", execution.errors[0] ?? "Worker step failed", retryAt);
    } else if (!hasPending && latestImportSummary) {
      await markRunSucceeded({
        runId: target.runId,
        metrics: {
          completionState: latestImportSummary.completionState,
          completedStatus: status,
          rowResults: latestImportSummary.rowResults,
          canonicalMaterialization: latestImportSummary.canonicalMaterialization,
        },
        activationSnapshot: latestActivationEval.snapshot,
        activationStatus: latestActivationEval.activationStatus,
        blockers: latestActivationEval.blockers,
      });
    }

    const after = await summarizeRunJobs(target.runId);
    const afterRunning = Number(after?.running ?? 0);
    const afterQueued = Number(after?.queued ?? 0);
    const afterRetryable = Number(after?.retryable_failed ?? 0);
    jobsClaimed += Math.max(0, beforeRunning + beforeQueued + beforeRetryable - (afterRunning + afterQueued + afterRetryable));
    jobsCompleted += Number(after?.succeeded ?? 0) - Number(before?.succeeded ?? 0);
    jobsFailed += Number(after?.terminal_failed ?? 0) - Number(before?.terminal_failed ?? 0);
    jobsRetried += Number(after?.retryable_failed ?? 0) - Number(before?.retryable_failed ?? 0);
  }

  const { count: remainingRunnableJobs } = await admin
    .from("shop_onboarding_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "retryable_failed"]);

  return NextResponse.json(
    {
      ok: true,
      runsTouched: touchedRuns.length,
      runIds: touchedRuns,
      jobsClaimed: Math.max(0, jobsClaimed),
      jobsCompleted: Math.max(0, jobsCompleted),
      jobsFailed: Math.max(0, jobsFailed),
      jobsRetried: Math.max(0, jobsRetried),
      remainingRunnableJobs: remainingRunnableJobs ?? 0,
      errors,
    },
    { status: 200 },
  );
}
