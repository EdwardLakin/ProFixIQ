import type {
  ShadowApprovalFlowPreview,
  ShadowMigrationStory,
  ShadowOperationalNarrative,
  ShadowPartSignal,
  ShadowWorkflowJob,
} from "@/features/integrations/shopBoost/shadowShop";
import type { ShopBoostPreflightReport } from "@/features/integrations/shopBoost/preflightAnalysis";

export type ShopBoostROIEvidenceLevel = "observed" | "modeled" | "insufficient";

export type ShopBoostROI = {
  revenue_opportunity: number;
  approval_speed_gain: number;
  labor_recovery_hours: number;
  parts_leakage_reduction: number;
  estimated_monthly_impact: number;
  estimated_monthly_impact_low: number;
  estimated_monthly_impact_high: number;
  evidence_level: ShopBoostROIEvidenceLevel;
  confidence: number;
  assumptions: string[];
};

function numericQuestionnaireValue(
  questionnaire: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = questionnaire?.[key];
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

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
  questionnaire?: Record<string, unknown>;
}): ShopBoostROI {
  const { snapshotLike } = args;
  const monthlyRepairOrders = numericQuestionnaireValue(args.questionnaire, "avgMonthlyRos");
  const awaitingApproval = snapshotLike.operationalNarrative.approvalsLikelyNeeded;
  const explicitlyStalled = snapshotLike.operationalNarrative.blockedCount;
  const observedJobSignals = awaitingApproval + explicitlyStalled;
  const hasObservedWorkflowEvidence = observedJobSignals > 0;

  const observedRevenueOpportunity = Math.round(
    awaitingApproval * 160 * 0.2 + explicitlyStalled * 210 * 0.25,
  );
  const modeledLaborHours =
    monthlyRepairOrders > 0 ? Math.round((monthlyRepairOrders * 3.5 / 60) * 10) / 10 : 0;
  const modeledCapacityValue = Math.round(modeledLaborHours * 90);
  const estimatedMonthlyImpact = observedRevenueOpportunity + modeledCapacityValue;

  const evidenceLevel: ShopBoostROIEvidenceLevel = hasObservedWorkflowEvidence
    ? "observed"
    : monthlyRepairOrders > 0
      ? "modeled"
      : "insufficient";
  const lowEstimate = estimatedMonthlyImpact > 0
    ? Math.round(estimatedMonthlyImpact * 0.6)
    : 0;
  const highEstimate = estimatedMonthlyImpact > 0
    ? Math.round(estimatedMonthlyImpact * 1.2)
    : 0;
  const approvalSpeedGain = awaitingApproval > 0
    ? Math.min(30, Math.max(1, Math.round((awaitingApproval / Math.max(snapshotLike.operationalNarrative.jobsIdentified, 1)) * 100 * 0.35)))
    : 0;

  const domainCoverage = args.domainSummaries.filter((domain) => domain.total > 0).length;
  const confidence = Math.max(
    20,
    Math.min(
      92,
      Math.round(
        snapshotLike.preflightReport.confidence.score * 0.55 +
          snapshotLike.migrationStory.autoMatchedCustomersPct * 0.2 +
          (domainCoverage / Math.max(args.domainSummaries.length, 1)) * 100 * 0.25,
      ),
    ),
  );

  const assumptions: string[] = [];
  if (monthlyRepairOrders > 0) {
    assumptions.push(
      `Capacity scenario uses the shop-reported ${Math.round(monthlyRepairOrders)} repair orders/month and 3.5 minutes of avoidable admin time per repair order.`,
      "Recovered capacity is valued at $90/hour; this is a planning assumption, not measured current loss.",
    );
  }
  if (hasObservedWorkflowEvidence) {
    assumptions.push(
      `The uploaded status fields explicitly identify ${awaitingApproval} awaiting-approval and ${explicitlyStalled} stalled repair orders.`,
      "Observed workflow recovery uses conservative lower-end recovery rates.",
    );
  }
  if (assumptions.length === 0) {
    assumptions.push(
      "The files do not contain enough explicit operating-status or monthly-volume evidence to calculate a credible savings range yet.",
    );
  }

  return {
    revenue_opportunity: observedRevenueOpportunity,
    approval_speed_gain: approvalSpeedGain,
    labor_recovery_hours: modeledLaborHours,
    parts_leakage_reduction: 0,
    estimated_monthly_impact: estimatedMonthlyImpact,
    estimated_monthly_impact_low: lowEstimate,
    estimated_monthly_impact_high: highEstimate,
    evidence_level: evidenceLevel,
    confidence,
    assumptions,
  };
}
