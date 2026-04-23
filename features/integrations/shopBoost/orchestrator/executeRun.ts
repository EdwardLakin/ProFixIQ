import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
import { runShopBoostDomainMaterialize } from "@/features/integrations/shopBoost/orchestrator/materializeHandlers";
import {
  MATERIALIZE_DOMAINS,
  claimNextRunnableJob,
  completeAttempt,
  computeRetryAfter,
  createAttempt,
  evaluateActivationRules,
  getJobAttemptCount,
  getRunJobs,
  markClaimedJobResult,
  markRunRunning,
  type ActivationEvaluationResult,
  type MaterializeDomain,
} from "./index";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asImportSummary(value: unknown): ShopBoostImportSummary | null {
  const rec = asRecord(value);
  return Object.keys(rec).length ? (rec as unknown as ShopBoostImportSummary) : null;
}

function toRetryableStatus(summary: ShopBoostImportSummary): "succeeded" | "retryable_failed" | "blocked_manual" {
  if (summary.completionState === "FAILED" || summary.completionState === "NOT_READY") return "retryable_failed";
  if (summary.completionState === "PARTIAL_FAILURE") return "blocked_manual";
  return "succeeded";
}

export async function executeShopBoostRun(args: {
  runId: string;
  shopId: string;
  intakeId: string;
  maxPasses: number;
  workerPrefix: string;
  allowImport: boolean;
}): Promise<{
  latestImportSummary: ShopBoostImportSummary | null;
  latestActivationEval: ActivationEvaluationResult | null;
  errors: string[];
}> {
  let latestImportSummary: ShopBoostImportSummary | null = null;
  let latestActivationEval: ActivationEvaluationResult | null = null;
  const errors: string[] = [];

  for (let pass = 0; pass < args.maxPasses; pass += 1) {
    const workerId = `${args.workerPrefix}:${args.runId}:pass-${pass + 1}`;
    const claimed = await claimNextRunnableJob({ runId: args.runId, workerId });
    if (!claimed) break;

    if (!args.allowImport && claimed.jobType !== "profile") break;

    const attemptId = await createAttempt({ jobId: claimed.id, runId: args.runId, workerId });

    try {
      if (claimed.jobType === "profile") {
        await markRunRunning(args.runId, "profiling");
        const snapshot = await buildShopBoostProfile({ shopId: args.shopId, intakeId: args.intakeId });
        await markClaimedJobResult({
          jobId: claimed.id,
          status: "succeeded",
          result: { has_snapshot: Boolean(snapshot), domain: "global" },
        });
      }

      if (claimed.jobType === "materialize") {
        await markRunRunning(args.runId, "materialize");
        const domain = claimed.domain as MaterializeDomain;
        const materialize = await runShopBoostDomainMaterialize({
          shopId: args.shopId,
          intakeId: args.intakeId,
          domain,
        });
        latestImportSummary = materialize.summary;
        await markClaimedJobResult({
          jobId: claimed.id,
          status: toRetryableStatus(materialize.summary),
          result: materialize.domainResult,
        });
      }

      if (claimed.jobType === "verify") {
        await markRunRunning(args.runId, "verify");

        if (!latestImportSummary) {
          const jobs = await getRunJobs(args.runId);
          const anchor = jobs.find((job) => job.job_type === "materialize" && String(job.domain ?? "global") === "customers");
          latestImportSummary = asImportSummary(anchor?.result);
        }

        if (!latestImportSummary) {
          await markClaimedJobResult({
            jobId: claimed.id,
            status: "blocked_manual",
            errorCode: "VERIFY_INPUT_MISSING",
            errorMessage: "Materialize anchor result is missing for verify job.",
          });
        } else {
          const jobs = await getRunJobs(args.runId);
          const domainJobs = jobs.filter((job) => job.job_type === "materialize");
          const domainStatusCounts = domainJobs.reduce((acc: Record<string, number>, job) => {
            const status = String(job.status ?? "unknown");
            acc[status] = (acc[status] ?? 0) + 1;
            return acc;
          }, {});

          const blockedDomains = domainJobs
            .filter((job) => String(job.status) === "blocked_manual")
            .map((job) => String(job.domain ?? "global"));
          const failedDomains = domainJobs
            .filter((job) => ["retryable_failed", "terminal_failed"].includes(String(job.status)))
            .map((job) => String(job.domain ?? "global"));
          const domainOutcomes = domainJobs.reduce(
            (acc: Record<string, { status: string; importedCount: number; rowResults: { success: number; review: number; failed: number } | null }>, job) => {
              const jobDomain = String(job.domain ?? "global");
              const result = asRecord(job.result);
              const rowResultsRecord = asRecord(result.rowResults);
              const rowResults =
                Object.keys(rowResultsRecord).length > 0
                  ? {
                      success: Number(rowResultsRecord.success ?? 0),
                      review: Number(rowResultsRecord.review ?? 0),
                      failed: Number(rowResultsRecord.failed ?? 0),
                    }
                  : null;
              acc[jobDomain] = {
                status: String(job.status ?? "unknown"),
                importedCount: Number(result.importedCount ?? 0),
                rowResults,
              };
              return acc;
            },
            {},
          );

          const integrityErrors = Array.isArray(latestImportSummary.rowResults.integrityErrors)
            ? latestImportSummary.rowResults.integrityErrors.map((row) => String(row))
            : [];

          latestActivationEval = await evaluateActivationRules(args.shopId, {
            completionState: latestImportSummary.completionState,
            integrityErrorCount: integrityErrors.length,
            pendingReviewCount: Number(latestImportSummary.rowResults.reviewCount ?? 0),
            failedCount: Number(latestImportSummary.rowResults.failedCount ?? 0),
            totalRows: Number(latestImportSummary.rowResults.totalRows ?? 0),
            canonicalStatus: latestImportSummary.canonicalMaterialization.status,
            canonicalGaps: latestImportSummary.canonicalMaterialization.gaps,
            customersImported: latestImportSummary.customersImported,
            vehiclesImported: latestImportSummary.vehiclesImported,
          });

          await markClaimedJobResult({
            jobId: claimed.id,
            status: "succeeded",
            result: {
              blockers: latestActivationEval.blockers,
              activationStatus: latestActivationEval.activationStatus,
              snapshot: latestActivationEval.snapshot,
              domains: {
                required: MATERIALIZE_DOMAINS,
                blocked: blockedDomains,
                failed: failedDomains,
                statusCounts: domainStatusCounts,
                outcomes: domainOutcomes,
              },
              canonicalGaps: latestImportSummary.canonicalMaterialization.gaps,
              completionState: latestImportSummary.completionState,
            },
          });
        }
      }

      if (claimed.jobType === "activate") {
        await markRunRunning(args.runId, "activate");

        if (!latestActivationEval) {
          const jobs = await getRunJobs(args.runId);
          const verify = jobs.find((job) => job.job_type === "verify" && String(job.domain ?? "global") === "global");
          const verifyResult = asRecord(verify?.result);
          const verifyStatus = String(verifyResult.activationStatus ?? verifyResult.activation_status ?? "blocked");
          latestActivationEval = {
            activationStatus: (verifyStatus as ActivationEvaluationResult["activationStatus"]) ?? "blocked",
            blockers: Array.isArray(verifyResult.blockers) ? verifyResult.blockers.map((v) => String(v)) : [],
            snapshot: asRecord(verifyResult.snapshot),
          };
        }

        await markClaimedJobResult({
          jobId: claimed.id,
          status:
            latestActivationEval.activationStatus === "blocked" || latestActivationEval.activationStatus === "not_eligible"
              ? "blocked_manual"
              : "succeeded",
          result: {
            activationStatus: latestActivationEval.activationStatus,
            blockers: latestActivationEval.blockers,
            snapshot: latestActivationEval.snapshot,
            source: "verify/global",
          },
        });
      }

      if (attemptId) {
        await completeAttempt({
          attemptId,
          status: "succeeded",
          metrics: { completed_at: new Date().toISOString(), jobType: claimed.jobType, domain: claimed.domain },
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const attempts = await getJobAttemptCount(claimed.id);
      const retryAfter = computeRetryAfter(attempts);

      await markClaimedJobResult({
        jobId: claimed.id,
        status: "retryable_failed",
        errorCode: "PROCESS_STEP_FAILED",
        errorMessage: msg,
        retryAfter,
      });

      if (attemptId) {
        await completeAttempt({
          attemptId,
          status: "failed",
          errorCode: "PROCESS_STEP_FAILED",
          errorMessage: msg,
          logs: [{ at: new Date().toISOString(), step: claimed.jobType, domain: claimed.domain, message: msg }],
        });
      }

      errors.push(msg);
      break;
    }
  }

  return { latestImportSummary, latestActivationEval, errors };
}
