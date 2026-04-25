import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type OrchestratorActivationStatus = "not_eligible" | "eligible" | "activated" | "blocked";
type OrchestratorRunState =
  | "uploaded"
  | "profiling"
  | "materialize"
  | "verify"
  | "activate"
  | "completed"
  | "retryable_failed"
  | "failed";

type OrchestratorAttemptStatus = "running" | "succeeded" | "failed" | "canceled";
type OrchestratorJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "retryable_failed"
  | "blocked_manual"
  | "terminal_failed"
  | "canceled";

type JsonObj = Record<string, unknown>;

export type OnboardingRunRow = {
  id: string;
  shop_id: string;
  intake_id: string;
  state: string;
  activation_status: string;
  activation_blockers: unknown;
  activation_snapshot: unknown;
};

type OnboardingJobRow = {
  id: string;
  run_id: string;
  job_type: string;
  domain: string | null;
  status: string;
  idempotency_key: string;
  priority?: number | null;
  max_attempts?: number | null;
  retry_after?: string | null;
  locked_by?: string | null;
  locked_at?: string | null;
  result?: unknown;
};

type OnboardingAttemptRow = {
  id: string;
  job_id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type ActivationRuleRow = {
  min_customer_rows: number | null;
  min_vehicle_rows: number | null;
  max_pending_review_ratio: number | null;
  max_failed_ratio: number | null;
  require_zero_integrity_errors: boolean | null;
  require_canonical_status_ok: boolean | null;
  auto_activate: boolean | null;
  enabled: boolean | null;
};

type ResolvedActivationRules = {
  min_customer_rows: number;
  min_vehicle_rows: number;
  max_pending_review_ratio: number;
  max_failed_ratio: number;
  require_zero_integrity_errors: boolean;
  require_canonical_status_ok: boolean;
  auto_activate: boolean;
  enabled: boolean;
};

export type ActivationEvaluationInput = {
  completionState?: string | null;
  integrityErrorCount?: number;
  pendingReviewCount?: number;
  failedCount?: number;
  totalRows?: number;
  canonicalStatus?: "ok" | "partial" | null;
  canonicalGaps?: {
    missingVehicles?: boolean;
    missingWorkOrders?: boolean;
    missingInvoices?: boolean;
    missingStaff?: boolean;
  } | null;
  customersImported?: number;
  vehiclesImported?: number;
};

export type ActivationEvaluationResult = {
  activationStatus: OrchestratorActivationStatus;
  blockers: string[];
  snapshot: JsonObj;
};

export type RunAttemptSummary = {
  attemptId: string;
  jobId: string;
  jobType: string | null;
  domain: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type RunAttemptSummaryDiagnostics = {
  code: "RUN_ATTEMPT_SUMMARY_QUERY_FAILED";
  message: string;
  hint?: string;
};

export type ClaimableJobType = "profile" | "materialize" | "verify" | "activate";
export type MaterializeDomain = "customers" | "vehicles" | "history" | "invoices" | "parts" | "staff";
type JobSeedDef = { job_type: ClaimableJobType; domain: string; priority: number };
export type ClaimedOnboardingJob = {
  id: string;
  runId: string;
  jobType: ClaimableJobType;
  domain: string;
  status: string;
  priority: number;
  maxAttempts: number;
  retryAfter: string | null;
};

export const MATERIALIZE_DOMAINS: MaterializeDomain[] = [
  "customers",
  "vehicles",
  "history",
  "invoices",
  "parts",
  "staff",
];

const SEED_JOBS: JobSeedDef[] = [
  { job_type: "profile", domain: "global", priority: 20 },
  ...MATERIALIZE_DOMAINS.map((domain, idx) => ({
    job_type: "materialize" as const,
    domain,
    priority: 40 + idx * 5,
  })),
  { job_type: "verify", domain: "global", priority: 80 },
  { job_type: "activate", domain: "global", priority: 100 },
];

const DEFAULT_RULES: ResolvedActivationRules = {
  min_customer_rows: 1,
  min_vehicle_rows: 1,
  max_pending_review_ratio: 0.08,
  max_failed_ratio: 0.02,
  require_zero_integrity_errors: true,
  require_canonical_status_ok: true,
  auto_activate: true,
  enabled: true,
};

function adminAny(): SupabaseClient<any> {
  return createAdminSupabase() as unknown as SupabaseClient<any>;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function setJobStatus(args: {
  supabase: SupabaseClient<any>;
  runId: string;
  jobType: string;
  domain: string;
  status: OrchestratorJobStatus;
  result?: JsonObj;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const payload: JsonObj = {
    status: args.status,
    updated_at: new Date().toISOString(),
  };
  if (args.status === "running") payload.started_at = new Date().toISOString();
  if (args.status === "succeeded" || args.status === "terminal_failed" || args.status === "canceled") {
    payload.completed_at = new Date().toISOString();
  }
  if (args.result) payload.result = args.result;
  if (typeof args.errorCode !== "undefined") payload.error_code = args.errorCode;
  if (typeof args.errorMessage !== "undefined") payload.error_message = args.errorMessage;

  await args.supabase
    .from("shop_onboarding_jobs")
    .update(payload)
    .eq("run_id", args.runId)
    .eq("job_type", args.jobType)
    .eq("domain", args.domain);
}

export async function ensureRun(args: {
  shopId: string;
  intakeId: string;
  triggerSource: "manual" | "cron" | "api" | "demo";
  createdBy?: string | null;
}): Promise<OnboardingRunRow | null> {
  const supabase = adminAny();
  const payload: JsonObj = {
    shop_id: args.shopId,
    intake_id: args.intakeId,
    trigger_source: args.triggerSource,
    created_by: args.createdBy ?? null,
    started_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("shop_onboarding_runs")
    .upsert(payload, { onConflict: "shop_id,intake_id" })
    .select("id,shop_id,intake_id,state,activation_status,activation_blockers,activation_snapshot")
    .maybeSingle();

  if (error) {
    console.error("[shop-boost/orchestrator] ensureRun failed", {
      shopId: args.shopId,
      intakeId: args.intakeId,
      error: error.message,
    });
    return null;
  }

  return (data as OnboardingRunRow | null) ?? null;
}

export async function seedRunJobs(args: {
  runId: string;
  shopId: string;
  intakeId: string;
}): Promise<OnboardingJobRow[]> {
  const supabase = adminAny();

  const seed = SEED_JOBS.map((job) => ({
    run_id: args.runId,
    shop_id: args.shopId,
    intake_id: args.intakeId,
    job_type: job.job_type,
    domain: job.domain,
    status: "queued",
    priority: job.priority,
    idempotency_key: `run:${args.runId}:${job.job_type}:${job.domain}`,
    payload: { intake_id: args.intakeId },
  }));

  const { error } = await supabase.from("shop_onboarding_jobs").upsert(seed, { onConflict: "idempotency_key" });
  if (error) {
    console.error("[shop-boost/orchestrator] seedRunJobs failed", {
      runId: args.runId,
      shopId: args.shopId,
      intakeId: args.intakeId,
      error: error.message,
    });
  }

  const { data } = await supabase
    .from("shop_onboarding_jobs")
    .select("id,run_id,job_type,domain,status,idempotency_key")
    .eq("run_id", args.runId)
    .order("priority", { ascending: true });

  return (data as OnboardingJobRow[]) ?? [];
}

export async function markRunRunning(
  runId: string,
  state: Extract<OrchestratorRunState, "profiling" | "materialize" | "verify" | "activate"> = "materialize",
): Promise<void> {
  const supabase = adminAny();
  const { error } = await supabase
    .from("shop_onboarding_runs")
    .update({
      state: state satisfies OrchestratorRunState,
      started_at: new Date().toISOString(),
      failed_at: null,
      error_code: null,
      error_message: null,
    })
    .eq("id", runId);

  if (error) {
    console.error("[shop-boost/orchestrator] markRunRunning failed", { runId, error: error.message });
  }
}

export async function markRunSucceeded(args: {
  runId: string;
  metrics: JsonObj;
  activationSnapshot: JsonObj;
  activationStatus: OrchestratorActivationStatus;
  blockers: string[];
}): Promise<void> {
  const supabase = adminAny();
  const { error } = await supabase
    .from("shop_onboarding_runs")
    .update({
      state: "completed" satisfies OrchestratorRunState,
      completed_at: new Date().toISOString(),
      failed_at: null,
      error_code: null,
      error_message: null,
      metrics: args.metrics,
      activation_snapshot: args.activationSnapshot,
      activation_status: args.activationStatus,
      activation_blockers: args.blockers,
    })
    .eq("id", args.runId);

  if (error) {
    console.error("[shop-boost/orchestrator] markRunSucceeded failed", {
      runId: args.runId,
      error: error.message,
    });
  }
}

export async function markRunFailed(runId: string, errorCode: string, errorMessage: string): Promise<void> {
  const supabase = adminAny();
  const { error } = await supabase
    .from("shop_onboarding_runs")
    .update({
      state: "failed" satisfies OrchestratorRunState,
      failed_at: new Date().toISOString(),
      error_code: errorCode,
      error_message: errorMessage,
    })
    .eq("id", runId);

  if (error) {
    console.error("[shop-boost/orchestrator] markRunFailed failed", { runId, error: error.message });
  }
}

export async function markRunRetryable(
  runId: string,
  errorCode: string,
  errorMessage: string,
  retryAfter: string,
): Promise<void> {
  const supabase = adminAny();
  const { error } = await supabase
    .from("shop_onboarding_runs")
    .update({
      state: "retryable_failed" satisfies OrchestratorRunState,
      failed_at: new Date().toISOString(),
      error_code: errorCode,
      error_message: errorMessage,
      retry_after: retryAfter,
    })
    .eq("id", runId);

  if (error) {
    console.error("[shop-boost/orchestrator] markRunRetryable failed", { runId, error: error.message });
  }
}

export async function createAttempt(args: {
  jobId: string;
  runId: string;
  workerId: string;
}): Promise<string | null> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_attempts")
    .insert({
      job_id: args.jobId,
      run_id: args.runId,
      worker_id: args.workerId,
      status: "running" satisfies OrchestratorAttemptStatus,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[shop-boost/orchestrator] createAttempt failed", {
      runId: args.runId,
      jobId: args.jobId,
      error: error.message,
    });
    return null;
  }

  return String(data?.id ?? "") || null;
}

export async function completeAttempt(args: {
  attemptId: string;
  status: OrchestratorAttemptStatus;
  errorCode?: string;
  errorMessage?: string;
  logs?: unknown[];
  metrics?: JsonObj;
}): Promise<void> {
  const supabase = adminAny();
  const { error } = await supabase
    .from("shop_onboarding_attempts")
    .update({
      status: args.status,
      completed_at: new Date().toISOString(),
      error_code: args.errorCode ?? null,
      error_message: args.errorMessage ?? null,
      logs: args.logs ?? [],
      metrics: args.metrics ?? {},
    })
    .eq("id", args.attemptId);

  if (error) {
    console.error("[shop-boost/orchestrator] completeAttempt failed", {
      attemptId: args.attemptId,
      error: error.message,
    });
  }
}

export async function setJobRunning(args: {
  runId: string;
  jobType: "profile" | "materialize" | "verify" | "activate";
}): Promise<void> {
  const supabase = adminAny();
  await setJobStatus({
    supabase,
    runId: args.runId,
    jobType: args.jobType,
    domain: "global",
    status: "running",
  });
}

export async function setJobResult(args: {
  runId: string;
  jobType: "profile" | "materialize" | "verify" | "activate";
  status: OrchestratorJobStatus;
  result?: JsonObj;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const supabase = adminAny();
  await setJobStatus({
    supabase,
    runId: args.runId,
    jobType: args.jobType,
    domain: "global",
    status: args.status,
    result: args.result,
    errorCode: args.errorCode,
    errorMessage: args.errorMessage,
  });
}

function isClaimableJobType(jobType: string): jobType is ClaimableJobType {
  return jobType === "profile" || jobType === "materialize" || jobType === "verify" || jobType === "activate";
}

function isReadyForRetry(retryAfter: string | null | undefined): boolean {
  if (!retryAfter) return true;
  const ts = Date.parse(retryAfter);
  if (!Number.isFinite(ts)) return true;
  return ts <= Date.now();
}

function jobKey(jobType: string, domain: string | null | undefined): string {
  return `${jobType}/${String(domain ?? "global")}`;
}

function dependenciesFor(jobType: ClaimableJobType, _domain: string): Array<{ jobType: ClaimableJobType; domain: string }> {
  if (jobType === "profile") return [];
  if (jobType === "materialize") return [{ jobType: "profile", domain: "global" }];
  if (jobType === "verify") {
    return MATERIALIZE_DOMAINS.map((materializeDomain) => ({
      jobType: "materialize" as const,
      domain: materializeDomain,
    }));
  }
  return [{ jobType: "verify", domain: "global" }];
}

export async function getRunJobs(runId: string): Promise<OnboardingJobRow[]> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_jobs")
    .select("id,run_id,job_type,domain,status,idempotency_key,priority,max_attempts,retry_after,locked_by,locked_at,result")
    .eq("run_id", runId)
    .order("priority", { ascending: true });

  if (error) {
    console.error("[shop-boost/orchestrator] getRunJobs failed", {
      runId,
      error: error.message,
    });
    return [];
  }
  return (data as OnboardingJobRow[]) ?? [];
}

export async function getJobAttemptCount(jobId: string): Promise<number> {
  const supabase = adminAny();
  const { count, error } = await supabase
    .from("shop_onboarding_attempts")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (error) {
    console.error("[shop-boost/orchestrator] getJobAttemptCount failed", {
      jobId,
      error: error.message,
    });
    return 0;
  }
  return Number(count ?? 0);
}

export function computeRetryAfter(attemptCount: number, baseSeconds = 45, maxSeconds = 1800): string {
  const exp = Math.max(0, attemptCount);
  const seconds = Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.min(exp, 6)));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function claimNextRunnableJob(args: {
  runId: string;
  workerId: string;
}): Promise<ClaimedOnboardingJob | null> {
  const supabase = adminAny();
  const jobs = await getRunJobs(args.runId);
  if (!jobs.length) return null;

  const byKey = new Map<string, OnboardingJobRow>();
  for (const job of jobs) {
    if (isClaimableJobType(job.job_type)) {
      byKey.set(jobKey(job.job_type, job.domain), job);
    }
  }

  for (const seed of SEED_JOBS) {
    const job = byKey.get(jobKey(seed.job_type, seed.domain));
    if (!job || !isClaimableJobType(job.job_type)) continue;
    const status = String(job.status ?? "queued");
    if (status !== "queued" && status !== "retryable_failed") continue;
    if (!isReadyForRetry(job.retry_after)) continue;

    const dependencies = dependenciesFor(job.job_type, String(job.domain ?? "global"));
    let dependencyBlocked = false;
    let waitingForDependency = false;
    for (const dep of dependencies) {
      const predecessor = byKey.get(jobKey(dep.jobType, dep.domain));
      const predecessorStatus = String(predecessor?.status ?? "missing");
      if (!predecessor || predecessorStatus === "queued" || predecessorStatus === "running" || predecessorStatus === "retryable_failed") {
        waitingForDependency = true;
        break;
      }
      if (predecessorStatus !== "succeeded") {
        dependencyBlocked = true;
        break;
      }
    }
    if (waitingForDependency) continue;
    if (dependencyBlocked) {
      await supabase
        .from("shop_onboarding_jobs")
        .update({
          status: "blocked_manual" satisfies OrchestratorJobStatus,
          error_code: "DEPENDENCY_BLOCKED",
          error_message: "One or more predecessor jobs did not succeed.",
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["queued", "retryable_failed"]);
      continue;
    }

    const maxAttempts = Math.max(1, Number(job.max_attempts ?? 3));
    const attempts = await getJobAttemptCount(job.id);
    if (attempts >= maxAttempts) {
      await supabase
        .from("shop_onboarding_jobs")
        .update({
          status: "terminal_failed" satisfies OrchestratorJobStatus,
          error_code: "MAX_ATTEMPTS_EXCEEDED",
          error_message: `Job exceeded max attempts (${maxAttempts}).`,
          locked_at: null,
          locked_by: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      continue;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("shop_onboarding_jobs")
      .update({
        status: "running" satisfies OrchestratorJobStatus,
        started_at: nowIso,
        locked_at: nowIso,
        locked_by: args.workerId,
        retry_after: null,
        updated_at: nowIso,
      })
      .eq("id", job.id)
      .in("status", ["queued", "retryable_failed"])
      .select("id,run_id,job_type,domain,status,priority,max_attempts,retry_after")
      .maybeSingle();

    if (error || !data) continue;

    if (!isClaimableJobType(String(data.job_type))) continue;
    return {
      id: String(data.id),
      runId: String(data.run_id),
      jobType: data.job_type,
      domain: String(data.domain ?? "global"),
      status: String(data.status ?? "running"),
      priority: Number(data.priority ?? 999),
      maxAttempts: Math.max(1, Number(data.max_attempts ?? 3)),
      retryAfter: (data.retry_after as string | null) ?? null,
    };
  }

  return null;
}

export async function markClaimedJobResult(args: {
  jobId: string;
  status: Extract<OrchestratorJobStatus, "succeeded" | "retryable_failed" | "blocked_manual" | "terminal_failed">;
  result?: JsonObj;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfter?: string | null;
}): Promise<void> {
  const supabase = adminAny();
  const payload: JsonObj = {
    status: args.status,
    updated_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
    error_code: args.errorCode ?? null,
    error_message: args.errorMessage ?? null,
    retry_after: args.retryAfter ?? null,
  };
  if (args.result) payload.result = args.result;
  if (args.status === "succeeded" || args.status === "terminal_failed") {
    payload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("shop_onboarding_jobs").update(payload).eq("id", args.jobId);
  if (error) {
    console.error("[shop-boost/orchestrator] markClaimedJobResult failed", {
      jobId: args.jobId,
      status: args.status,
      error: error.message,
    });
  }
}

export async function getRunByShopIntake(args: {
  shopId: string;
  intakeId: string;
}): Promise<OnboardingRunRow | null> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_runs")
    .select("id,shop_id,intake_id,state,activation_status,activation_blockers,activation_snapshot")
    .eq("shop_id", args.shopId)
    .eq("intake_id", args.intakeId)
    .maybeSingle();
  if (error) {
    console.error("[shop-boost/orchestrator] getRunByShopIntake failed", {
      shopId: args.shopId,
      intakeId: args.intakeId,
      error: error.message,
    });
    return null;
  }
  return (data as OnboardingRunRow | null) ?? null;
}

export async function summarizeRunJobs(runId: string): Promise<Record<string, number> | null> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_jobs")
    .select("status")
    .eq("run_id", runId)
    .limit(100);

  if (error) {
    console.error("[shop-boost/orchestrator] summarizeRunJobs failed", { runId, error: error.message });
    return null;
  }

  const summary: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = String((row as { status?: string }).status ?? "unknown");
    summary[key] = (summary[key] ?? 0) + 1;
  }

  return summary;
}

export async function summarizeRunJobsDetailed(runId: string): Promise<{
  byStatus: Record<string, number>;
  byDomainStatus: Record<string, Record<string, number>>;
  domains: {
    blocked: string[];
    failed: string[];
    pending: string[];
    succeeded: string[];
  };
}> {
  const jobs = await getRunJobs(runId);
  const byStatus: Record<string, number> = {};
  const byDomainStatus: Record<string, Record<string, number>> = {};
  const domains = {
    blocked: [] as string[],
    failed: [] as string[],
    pending: [] as string[],
    succeeded: [] as string[],
  };

  for (const job of jobs) {
    const status = String(job.status ?? "unknown");
    const domain = String(job.domain ?? "global");
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    const domainSummary = (byDomainStatus[domain] ??= {});
    domainSummary[status] = (domainSummary[status] ?? 0) + 1;

    if (job.job_type !== "materialize") continue;
    const domainKey = `${job.job_type}/${domain}`;
    if (status === "succeeded") domains.succeeded.push(domainKey);
    else if (status === "blocked_manual") domains.blocked.push(domainKey);
    else if (status === "terminal_failed" || status === "retryable_failed") domains.failed.push(domainKey);
    else domains.pending.push(domainKey);
  }

  return { byStatus, byDomainStatus, domains };
}

export async function getLatestRunAttemptSummary(runId: string): Promise<RunAttemptSummary | null> {
  const { summary } = await getLatestRunAttemptSummaryWithDiagnostics(runId);
  return summary;
}

export async function getLatestRunAttemptSummaryWithDiagnostics(
  runId: string,
): Promise<{ summary: RunAttemptSummary | null; diagnostics: RunAttemptSummaryDiagnostics | null }> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_attempts")
    .select("id,job_id,status,error_code,error_message,started_at,completed_at")
    .eq("run_id", runId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[shop-boost/orchestrator] getLatestRunAttemptSummary failed", {
      runId,
      error: error.message,
    });
    return {
      summary: null,
      diagnostics: {
        code: "RUN_ATTEMPT_SUMMARY_QUERY_FAILED",
        message: error.message,
        hint:
          error.message.includes("shop_onboarding_attempts.created_at")
            ? "shop_onboarding_attempts uses started_at (not created_at) for attempt timestamps."
            : undefined,
      },
    };
  }

  const attempt = (data as OnboardingAttemptRow | null) ?? null;
  if (!attempt?.id) return { summary: null, diagnostics: null };

  const { data: job } = await supabase
    .from("shop_onboarding_jobs")
    .select("job_type,domain")
    .eq("id", attempt.job_id)
    .maybeSingle<{ job_type: string | null; domain: string | null }>();

  return {
    summary: {
      attemptId: attempt.id,
      jobId: attempt.job_id,
      jobType: job?.job_type ?? null,
      domain: job?.domain ?? null,
      status: attempt.status,
      errorCode: attempt.error_code,
      errorMessage: attempt.error_message,
      createdAt: attempt.started_at,
      completedAt: attempt.completed_at,
    },
    diagnostics: null,
  };
}

export async function evaluateActivationRules(
  shopId: string,
  computedSummary: ActivationEvaluationInput,
): Promise<ActivationEvaluationResult> {
  const supabase = adminAny();

  const { data, error } = await supabase
    .from("shop_onboarding_activation_rules")
    .select(
      "enabled,min_customer_rows,min_vehicle_rows,max_pending_review_ratio,max_failed_ratio,require_zero_integrity_errors,require_canonical_status_ok,auto_activate",
    )
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) {
    console.error("[shop-boost/activation] load activation rules failed; using defaults", {
      shopId,
      error: error.message,
    });
  }

  const fromDb = (data as ActivationRuleRow | null) ?? null;
  const rules: ResolvedActivationRules = {
    min_customer_rows: fromDb?.min_customer_rows ?? DEFAULT_RULES.min_customer_rows,
    min_vehicle_rows: fromDb?.min_vehicle_rows ?? DEFAULT_RULES.min_vehicle_rows,
    max_pending_review_ratio: fromDb?.max_pending_review_ratio ?? DEFAULT_RULES.max_pending_review_ratio,
    max_failed_ratio: fromDb?.max_failed_ratio ?? DEFAULT_RULES.max_failed_ratio,
    require_zero_integrity_errors: fromDb?.require_zero_integrity_errors ?? DEFAULT_RULES.require_zero_integrity_errors,
    require_canonical_status_ok: fromDb?.require_canonical_status_ok ?? DEFAULT_RULES.require_canonical_status_ok,
    auto_activate: fromDb?.auto_activate ?? DEFAULT_RULES.auto_activate,
    enabled: fromDb?.enabled ?? DEFAULT_RULES.enabled,
  };

  const totalRows = Math.max(0, asNumber(computedSummary.totalRows, 0));
  const pendingReviewCount = Math.max(0, asNumber(computedSummary.pendingReviewCount, 0));
  const failedCount = Math.max(0, asNumber(computedSummary.failedCount, 0));
  const integrityErrorCount = Math.max(0, asNumber(computedSummary.integrityErrorCount, 0));
  const customersImported = Math.max(0, asNumber(computedSummary.customersImported, 0));
  const vehiclesImported = Math.max(0, asNumber(computedSummary.vehiclesImported, 0));

  const pendingRatio = totalRows > 0 ? pendingReviewCount / totalRows : 0;
  const failedRatio = totalRows > 0 ? failedCount / totalRows : 0;

  const blockers: string[] = [];

  if (!rules.enabled) {
    blockers.push("Activation rules disabled for this shop.");
  }

  const completion = String(computedSummary.completionState ?? "");
  if (!completion || ["PARTIAL_FAILURE", "FAILED", "NOT_READY"].includes(completion)) {
    blockers.push(`Completion state ${completion || "unknown"} is not go-live eligible.`);
  }

  if (rules.require_zero_integrity_errors && integrityErrorCount > 0) {
    blockers.push(`Integrity errors detected: ${integrityErrorCount}.`);
  }

  if (pendingRatio > rules.max_pending_review_ratio) {
    blockers.push(
      `Pending review ratio ${(pendingRatio * 100).toFixed(2)}% exceeds ${(rules.max_pending_review_ratio * 100).toFixed(2)}%.`,
    );
  }

  if (failedRatio > rules.max_failed_ratio) {
    blockers.push(`Failed ratio ${(failedRatio * 100).toFixed(2)}% exceeds ${(rules.max_failed_ratio * 100).toFixed(2)}%.`);
  }

  if (rules.require_canonical_status_ok && computedSummary.canonicalStatus && computedSummary.canonicalStatus !== "ok") {
    blockers.push(`Canonical materialization status is ${computedSummary.canonicalStatus}.`);
  }

  const gaps = computedSummary.canonicalGaps;
  if (gaps?.missingVehicles) blockers.push("Canonical gap: vehicles missing.");
  if (gaps?.missingWorkOrders) blockers.push("Canonical gap: work orders missing.");
  if (gaps?.missingInvoices) blockers.push("Canonical gap: invoices missing.");

  if (customersImported < rules.min_customer_rows) {
    blockers.push(`Customers imported (${customersImported}) below minimum (${rules.min_customer_rows}).`);
  }
  if (vehiclesImported < rules.min_vehicle_rows) {
    blockers.push(`Vehicles imported (${vehiclesImported}) below minimum (${rules.min_vehicle_rows}).`);
  }

  const eligible = blockers.length === 0;
  const activationStatus: OrchestratorActivationStatus = eligible
    ? rules.auto_activate
      ? "activated"
      : "eligible"
    : "blocked";

  return {
    activationStatus,
    blockers,
    snapshot: {
      evaluated_at: new Date().toISOString(),
      completionState: completion || null,
      integrityErrorCount,
      pendingReviewCount,
      failedCount,
      totalRows,
      pendingRatio,
      failedRatio,
      canonicalStatus: computedSummary.canonicalStatus ?? null,
      canonicalGaps: computedSummary.canonicalGaps ?? null,
      customersImported,
      vehiclesImported,
      rules,
      eligible,
    },
  };
}
