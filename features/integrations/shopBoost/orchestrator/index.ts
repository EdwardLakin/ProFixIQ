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
};

type OnboardingAttemptRow = {
  id: string;
  job_id: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
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

const SEED_JOBS = [
  { job_type: "profile", domain: "global", priority: 20 },
  { job_type: "materialize", domain: "global", priority: 40 },
  { job_type: "verify", domain: "global", priority: 60 },
  { job_type: "activate", domain: "global", priority: 80 },
] as const;

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

export async function getLatestRunAttemptSummary(runId: string): Promise<RunAttemptSummary | null> {
  const supabase = adminAny();
  const { data, error } = await supabase
    .from("shop_onboarding_attempts")
    .select("id,job_id,status,error_code,error_message,created_at,completed_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[shop-boost/orchestrator] getLatestRunAttemptSummary failed", {
      runId,
      error: error.message,
    });
    return null;
  }

  const attempt = (data as OnboardingAttemptRow | null) ?? null;
  if (!attempt?.id) return null;

  const { data: job } = await supabase
    .from("shop_onboarding_jobs")
    .select("job_type,domain")
    .eq("id", attempt.job_id)
    .maybeSingle<{ job_type: string | null; domain: string | null }>();

  return {
    attemptId: attempt.id,
    jobId: attempt.job_id,
    jobType: job?.job_type ?? null,
    domain: job?.domain ?? null,
    status: attempt.status,
    errorCode: attempt.error_code,
    errorMessage: attempt.error_message,
    createdAt: attempt.created_at,
    completedAt: attempt.completed_at,
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
