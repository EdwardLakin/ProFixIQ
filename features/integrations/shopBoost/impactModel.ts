import type {
  ShadowApprovalFlowPreview,
  ShadowMigrationStory,
  ShadowPartSignal,
  ShadowWorkflowJob,
} from "@/features/integrations/shopBoost/shadowShop";
import type { ShopBoostPreflightReport } from "@/features/integrations/shopBoost/preflightAnalysis";

export type ImpactComparison = {
  before: {
    approval_rate: number;
    avg_job_completion_time: number;
    parts_sync_rate: number;
  };
  after: {
    approval_rate: number;
    avg_job_completion_time: number;
    parts_sync_rate: number;
  };
};

export function buildShopBoostImpactComparison(args: {
  preflightReport: ShopBoostPreflightReport;
  migrationStory: ShadowMigrationStory;
  domainSummaries: Array<{ domain: string; total: number; reviewRequired: number; failed: number }>;
  workflowJobs: ShadowWorkflowJob[];
  approvalFlow: ShadowApprovalFlowPreview;
  partsSignals: ShadowPartSignal[];
}): ImpactComparison {
  const jobCount = Math.max(args.workflowJobs.length, 1);
  const reviewRatio = args.preflightReport.totals.likelyReviewNeededCount / Math.max(args.preflightReport.totals.detectedRecords, 1);

  const beforeApprovalRate = Math.max(
    42,
    Math.min(
      92,
      Math.round(((args.approvalFlow.waitingCustomerApproval + 1) / (jobCount + 2)) * 100 + (1 - reviewRatio) * 20),
    ),
  );

  const partsStable = args.partsSignals.filter((signal) => signal.status === "likely_stocked").length;
  const beforePartsSyncRate = Math.max(35, Math.min(95, Math.round((partsStable / Math.max(args.partsSignals.length, 1)) * 100)));

  const blockedOrReview = args.workflowJobs.filter((job) => job.status === "blocked" || job.inspectionState === "needs_review").length;
  const beforeCompletionDays = Math.max(2.1, Number((4.6 + blockedOrReview * 0.16 + reviewRatio * 1.8).toFixed(1)));

  const afterApprovalRate = Math.min(98, Math.round(beforeApprovalRate + Math.max(6, Math.min(18, Math.round((100 - beforeApprovalRate) * 0.35)))));
  const afterPartsSyncRate = Math.min(98, Math.round(beforePartsSyncRate + Math.max(7, Math.min(20, Math.round((100 - beforePartsSyncRate) * 0.42)))));
  const afterCompletionDays = Math.max(1.7, Number((beforeCompletionDays - Math.max(0.7, Math.min(2.1, blockedOrReview * 0.08 + 0.7))).toFixed(1)));

  return {
    before: {
      approval_rate: beforeApprovalRate,
      avg_job_completion_time: beforeCompletionDays,
      parts_sync_rate: beforePartsSyncRate,
    },
    after: {
      approval_rate: afterApprovalRate,
      avg_job_completion_time: afterCompletionDays,
      parts_sync_rate: afterPartsSyncRate,
    },
  };
}
