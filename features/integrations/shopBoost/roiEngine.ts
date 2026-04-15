import type {
  ShadowApprovalFlowPreview,
  ShadowMigrationStory,
  ShadowOperationalNarrative,
  ShadowPartSignal,
  ShadowWorkflowJob,
} from "@/features/integrations/shopBoost/shadowShop";
import type { ShopBoostPreflightReport } from "@/features/integrations/shopBoost/preflightAnalysis";

export type ShopBoostROI = {
  revenue_opportunity: number;
  approval_speed_gain: number;
  labor_recovery_hours: number;
  parts_leakage_reduction: number;
  estimated_monthly_impact: number;
  confidence: number;
  assumptions: string[];
};

export function buildShopBoostROI(args: {
  snapshotLike: {
    preflightReport: ShopBoostPreflightReport;
    migrationStory: ShadowMigrationStory;
    workflowJobs: ShadowWorkflowJob[];
    approvalFlow: ShadowApprovalFlowPreview;
    partsSignals: ShadowPartSignal[];
    operationalNarrative: ShadowOperationalNarrative;
  };
  domainSummaries: Array<{ domain: string; total: number; reviewRequired: number; failed: number }>;
}): ShopBoostROI {
  const { snapshotLike } = args;

  const stalledJobs = snapshotLike.workflowJobs.filter((job) => job.status === "blocked" || job.status === "awaiting_approval").length;
  const approvalBacklog = snapshotLike.approvalFlow.waitingCustomerApproval;
  const incompleteWorkOrders = snapshotLike.operationalNarrative.reviewNeededCount + snapshotLike.operationalNarrative.blockedCount;
  const duplicateSignals = Math.max(0, Math.round((100 - snapshotLike.migrationStory.autoMatchedCustomersPct) * 0.08));
  const missingPartsLinkage = snapshotLike.partsSignals.filter((signal) => signal.status !== "likely_stocked").length;

  const approvalRecovery = Math.round(approvalBacklog * 160 * 0.2);
  const stalledRecovery = Math.round(stalledJobs * 210 * 0.25);
  const dataHygieneRecovery = Math.round((incompleteWorkOrders + duplicateSignals) * 95 * 0.14);

  const revenueOpportunity = Math.max(0, approvalRecovery + stalledRecovery + dataHygieneRecovery);
  const approvalSpeedGain = Math.max(8, Math.min(34, Math.round((approvalBacklog / Math.max(snapshotLike.workflowJobs.length, 1)) * 100 * 0.45 + 8)));
  const laborRecoveryHours = Math.max(2, Math.round((incompleteWorkOrders * 0.55 + duplicateSignals * 0.35) * 10) / 10);
  const partsLeakageReduction = Math.max(5, Math.min(28, Math.round((missingPartsLinkage / Math.max(snapshotLike.partsSignals.length, 1)) * 100 * 0.4 + 5)));

  const monthlyImpact = Math.round(revenueOpportunity + laborRecoveryHours * 90 + missingPartsLinkage * 45);
  const domainCoverage = args.domainSummaries.filter((domain) => domain.total > 0).length;
  const confidence = Math.max(
    45,
    Math.min(
      96,
      Math.round(
        snapshotLike.preflightReport.confidence.score * 0.5 +
          snapshotLike.migrationStory.autoMatchedCustomersPct * 0.25 +
          (domainCoverage / Math.max(args.domainSummaries.length, 1)) * 100 * 0.25,
      ),
    ),
  );

  return {
    revenue_opportunity: revenueOpportunity,
    approval_speed_gain: approvalSpeedGain,
    labor_recovery_hours: laborRecoveryHours,
    parts_leakage_reduction: partsLeakageReduction,
    estimated_monthly_impact: monthlyImpact,
    confidence,
    assumptions: [
      `Based on your data, ${approvalBacklog} jobs are currently waiting for approval and typically lose 15-25% if delayed.`,
      `We detected ${missingPartsLinkage} parts linkage issues that commonly increase write-offs and rebill time.`,
      `Stalled and incomplete jobs (${stalledJobs + incompleteWorkOrders}) were valued conservatively using lower-end shop recovery patterns.`,
      "Ranges are directional and use conservative estimates from typical independent/fleet shop workflow patterns.",
    ],
  };
}
