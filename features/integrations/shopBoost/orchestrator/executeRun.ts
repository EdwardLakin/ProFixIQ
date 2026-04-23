import { buildShopBoostProfile } from "@/features/integrations/ai/shopBoost";
import { runShopBoostImport, type ShopBoostImportSummary } from "@/features/integrations/imports/runFullImport";
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

type DomainJobResult = {
  domain: MaterializeDomain;
  completionState: string;
  rowResults: { success: number; review: number; failed: number };
  importedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asImportSummary(value: unknown): ShopBoostImportSummary | null {
  const rec = asRecord(value);
  return Object.keys(rec).length ? (rec as unknown as ShopBoostImportSummary) : null;
}

function readDomainResult(summary: ShopBoostImportSummary, domain: MaterializeDomain): DomainJobResult {
  const byDomain = summary.rowResults.byDomain ?? {};
  const rowResults = byDomain[domain] ?? { success: 0, review: 0, failed: 0 };
  const importedCountMap: Record<MaterializeDomain, number> = {
    customers: Number(summary.customersImported ?? 0),
    vehicles: Number(summary.vehiclesImported ?? 0),
    history: Number(summary.workOrdersImported ?? 0),
    invoices: Number(summary.invoicesImported ?? 0),
    parts: Number(summary.partsImported ?? 0),
    staff: Number(summary.canonicalMaterialization.actual.staffSuggestions ?? 0),
  };

  return {
    domain,
    completionState: summary.completionState,
    rowResults,
    importedCount: importedCountMap[domain],
  };
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

        if (domain === "customers") {
          latestImportSummary = await runShopBoostImport({
            shopId: args.shopId,
            intakeId: args.intakeId,
            options: { createStaffUsers: false },
          });

          const domainResult = readDomainResult(latestImportSummary, domain);
          await markClaimedJobResult({
            jobId: claimed.id,
            status: toRetryableStatus(latestImportSummary),
            result: {
              mode: "full_import_anchor",
              ...domainResult,
              canonicalMaterialization: latestImportSummary.canonicalMaterialization,
              rowResultsFull: latestImportSummary.rowResults,
            },
          });
        } else {
          if (!latestImportSummary) {
            const jobs = await getRunJobs(args.runId);
            const anchor = jobs.find(
              (job) => job.job_type === "materialize" && String(job.domain ?? "global") === "customers",
            );
            latestImportSummary = asImportSummary(anchor?.result);
          }

          if (!latestImportSummary) {
            await markClaimedJobResult({
              jobId: claimed.id,
              status: "blocked_manual",
              errorCode: "MATERIALIZE_ANCHOR_MISSING",
              errorMessage: "Customers materialize anchor result is required before domain fanout.",
            });
          } else {
            const domainResult = readDomainResult(latestImportSummary, domain);
            await markClaimedJobResult({
              jobId: claimed.id,
              status: toRetryableStatus(latestImportSummary),
              result: {
                mode: "derived_from_anchor",
                ...domainResult,
              },
            });
          }
        }
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
