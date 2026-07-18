import type { ActivationReadiness } from "@/features/integrations/shopBoost/activationContext";
import type { ShadowPreviewContext, ShadowShopSnapshot } from "@/features/integrations/shopBoost/shadowShop";

export type ConfidenceBand = "HIGH" | "MODERATE" | "EARLY_ESTIMATE";

export type ConfidencePresentation = {
  band: ConfidenceBand;
  title: string;
  explanation: string;
  increasesConfidence: string;
  lowersConfidence: string;
};

export type ConsequenceItem = {
  key: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

export type DecisionSummary = {
  heading: string;
  summary: string;
  monthlyValueAtRisk: number;
  recoverableValue: number;
  topDrivers: string[];
  readinessSummary: string;
  blockerSummary: string;
  confidence: ConfidencePresentation;
  primaryActionLabel: string;
  primaryActionHelper: string;
  secondaryActionLabel: string;
};

export type StakeholderTakeaway = {
  role: "owner" | "manager" | "advisor";
  label: string;
  message: string;
};

export type ObjectionHandlingContent = {
  title: string;
  bullets: string[];
  whyReviewExists: string;
};

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function importReadiness(snapshot: ShadowShopSnapshot) {
  return snapshot.importReadiness ?? {
    detectedRecords: snapshot.preflightReport.totals.detectedRecords,
    readyRecords: snapshot.preflightReport.totals.likelyAutoImportCount,
    reviewRecords: snapshot.preflightReport.totals.likelyReviewNeededCount,
    blockedRecords: snapshot.preflightReport.totals.likelyBlockerCount,
    historyRows: snapshot.operationalNarrative.historyRowsDetected ?? snapshot.operationalNarrative.jobsIdentified,
    uniqueHistoryJobs: snapshot.operationalNarrative.jobsIdentified,
    readyHistoryJobs: snapshot.operationalNarrative.workReadyCount,
    reviewHistoryJobs: snapshot.operationalNarrative.reviewNeededCount,
    blockedHistoryJobs: snapshot.operationalNarrative.estimatedOperationalBlockers,
    linkageAccuracy: snapshot.projectionConfidence.factors.matchingAccuracy,
    domainCoverage: snapshot.projectionConfidence.factors.domainCoverage,
  };
}

export function buildConfidencePresentation(snapshot: ShadowShopSnapshot): ConfidencePresentation {
  const score = snapshot.projectionConfidence.score;
  const readiness = importReadiness(snapshot);

  if (score >= 80 && readiness.blockedHistoryJobs === 0 && readiness.reviewHistoryJobs === 0) {
    return {
      band: "HIGH",
      title: "High import confidence",
      explanation: "The uploaded domains have stable identifiers and customer/vehicle links for controlled import.",
      increasesConfidence: "Complete identifiers and linked repair orders increase confidence.",
      lowersConfidence: "Missing identifiers and ambiguous customer/vehicle links reduce confidence.",
    };
  }

  if (score >= 60 && readiness.blockedHistoryJobs === 0) {
    return {
      band: "MODERATE",
      title: "Moderate import confidence",
      explanation: "Most data can proceed, with ambiguous repair orders held for guided review.",
      increasesConfidence: "Confirming flagged customer and vehicle links will raise confidence.",
      lowersConfidence: `${readiness.reviewHistoryJobs} repair order${readiness.reviewHistoryJobs === 1 ? "" : "s"} still need link review.`,
    };
  }

  return {
    band: "EARLY_ESTIMATE",
    title: "Import review required",
    explanation: "Some repair orders lack the identifiers or links required for safe materialization.",
    increasesConfidence: "Resolving the guided review queue will improve import confidence.",
    lowersConfidence: `${readiness.blockedHistoryJobs} blocked and ${readiness.reviewHistoryJobs} review repair orders remain.`,
  };
}

export function buildConsequenceItems(snapshot: ShadowShopSnapshot): ConsequenceItem[] {
  const items: ConsequenceItem[] = [];
  const readiness = importReadiness(snapshot);
  const partsConflicts = snapshot.operationalNarrative.partsInventoryConflicts;

  if (readiness.reviewHistoryJobs > 0) {
    items.push({
      key: "review-needed",
      severity: "warning",
      title: `${readiness.reviewHistoryJobs} repair order${readiness.reviewHistoryJobs === 1 ? "" : "s"} need guided review`,
      detail: "These repair orders will be held until their customer and vehicle links are confirmed.",
    });
  }

  if (readiness.blockedHistoryJobs > 0) {
    items.push({
      key: "blockers",
      severity: "critical",
      title: `${readiness.blockedHistoryJobs} repair order${readiness.blockedHistoryJobs === 1 ? "" : "s"} lack a stable identifier`,
      detail: "A repair-order or invoice identifier is required before those rows can be materialized.",
    });
  }

  if (partsConflicts > 0) {
    items.push({
      key: "parts-conflicts",
      severity: "warning",
      title: `${partsConflicts} parts row${partsConflicts === 1 ? "" : "s"} need mapping review`,
      detail: "Those rows will be held from live inventory until their identifiers are confirmed.",
    });
  }

  if (items.length === 0) {
    items.push({
      key: "clean",
      severity: "info",
      title: "No import blockers detected",
      detail: "The detected repair orders have stable identifiers and customer/vehicle links for controlled activation.",
    });
  }

  if (snapshot.urgencySignals.stalledJobs > 0) {
    items.push({
      key: "stalled",
      severity: "warning",
      title: `${snapshot.urgencySignals.stalledJobs} explicitly stalled repair order${snapshot.urgencySignals.stalledJobs === 1 ? "" : "s"}`,
      detail: "This count comes from status fields in the uploaded export, not an inferred workflow state.",
    });
  }

  return items;
}

function buildTopDrivers(snapshot: ShadowShopSnapshot): string[] {
  const readiness = importReadiness(snapshot);
  return [
    readiness.reviewHistoryJobs > 0
      ? `${readiness.reviewHistoryJobs} repair orders need customer/vehicle link review`
      : "",
    readiness.blockedHistoryJobs > 0
      ? `${readiness.blockedHistoryJobs} repair orders need stable identifiers`
      : "",
    snapshot.operationalNarrative.partsInventoryConflicts > 0
      ? `${snapshot.operationalNarrative.partsInventoryConflicts} parts rows need mapping review`
      : "",
  ].filter(Boolean);
}

export function buildDecisionSummary(context: ShadowPreviewContext): DecisionSummary {
  const { snapshot, shopName } = context;
  const confidence = buildConfidencePresentation(snapshot);
  const readiness = importReadiness(snapshot);
  const evidenceLevel = snapshot.roi.evidence_level ?? "insufficient";
  const low = snapshot.roi.estimated_monthly_impact_low ?? 0;
  const high = snapshot.roi.estimated_monthly_impact_high ?? snapshot.roi.estimated_monthly_impact;
  const recoverableValue = Math.max(0, snapshot.roi.estimated_monthly_impact);
  const monthlyValueAtRisk =
    evidenceLevel === "observed" ? Math.max(0, snapshot.urgencySignals.revenueAtRiskNow) : 0;
  const monthlyRos = Number(snapshot.questionnaire?.avgMonthlyRos ?? 0);

  const summary =
    evidenceLevel === "observed"
      ? `The uploaded status fields for ${shopName} show active workflow friction. The evidence-backed recovery scenario is ${formatUsd(low)}–${formatUsd(high)}/month.`
      : evidenceLevel === "modeled"
        ? `At the reported ${Math.round(monthlyRos)} repair orders/month, ProFixIQ models ${formatUsd(low)}–${formatUsd(high)}/month in recoverable capacity. This is a planning estimate, not measured current loss.`
        : `${shopName}'s files show import readiness and review needs, but not enough operational evidence to claim a credible savings amount yet.`;

  const readinessSummary =
    readiness.blockedHistoryJobs > 0
      ? "Activation can begin, but blocked repair orders must be resolved before full materialization."
      : readiness.reviewHistoryJobs > 0
        ? "Activation can proceed; ambiguous repair orders will enter guided review."
        : "The detected repair orders are ready for controlled activation.";

  return {
    heading: "What your data says right now",
    summary,
    monthlyValueAtRisk,
    recoverableValue,
    topDrivers: buildTopDrivers(snapshot).slice(0, 3),
    readinessSummary,
    blockerSummary:
      readiness.blockedHistoryJobs > 0
        ? `${readiness.blockedHistoryJobs} repair-order blocker${readiness.blockedHistoryJobs === 1 ? "" : "s"} will be surfaced in guided review.`
        : "No repair-order identifier blockers were detected.",
    confidence,
    primaryActionLabel:
      readiness.blockedHistoryJobs > 0 || readiness.reviewHistoryJobs > 0
        ? "Activate and review your import"
        : "Turn this analysis into a live system",
    primaryActionHelper:
      "Activation carries these five staged datasets and their review decisions into guided onboarding.",
    secondaryActionLabel: "Share this analysis",
  };
}

export function buildStakeholderTakeaways(snapshot: ShadowShopSnapshot): StakeholderTakeaway[] {
  const readiness = importReadiness(snapshot);
  const range =
    (snapshot.roi.estimated_monthly_impact_high ?? 0) > 0
      ? ` The planning range is ${formatUsd(snapshot.roi.estimated_monthly_impact_low ?? 0)}–${formatUsd(snapshot.roi.estimated_monthly_impact_high ?? 0)}/month.`
      : "";

  return [
    {
      role: "owner",
      label: "Owner next step",
      message: `Activate the controlled import; ProFixIQ will carry the files into setup and hold ambiguous rows for review.${range}`,
    },
    {
      role: "manager",
      label: "Import manager takeaway",
      message: `${readiness.readyHistoryJobs} repair orders are ready, ${readiness.reviewHistoryJobs} need review, and ${readiness.blockedHistoryJobs} are blocked.`,
    },
    {
      role: "advisor",
      label: "Advisor impact",
      message:
        readiness.reviewHistoryJobs > 0
          ? `${readiness.reviewHistoryJobs} repair orders need customer/vehicle confirmation before their history is trusted.`
          : "Detected repair orders have the customer and vehicle links needed for history lookup.",
    },
  ];
}

export function buildObjectionHandlingContent(snapshot: ShadowShopSnapshot): ObjectionHandlingContent {
  const readiness = importReadiness(snapshot);
  const reviewQueue = readiness.reviewHistoryJobs + readiness.blockedHistoryJobs;

  return {
    title: "How activation stays safe",
    bullets: [
      "The preview is read-only and has not created live operational records.",
      "Activation uses the same customers, vehicles, history, invoices, and parts flow as guided onboarding.",
      "Ambiguous rows are held for review instead of silently written live.",
      "The staged files and analysis context carry into setup, so the shop does not upload them again.",
      readiness.blockedHistoryJobs > 0
        ? `${readiness.blockedHistoryJobs} blocked repair order${readiness.blockedHistoryJobs === 1 ? "" : "s"} will remain held until resolved.`
        : "No repair-order identifier blocker is forcing a hard stop.",
    ],
    whyReviewExists:
      reviewQueue > 0
        ? `Why review exists: ${reviewQueue} repair orders have missing identifiers or ambiguous customer/vehicle links.`
        : "Why review exists: only future ambiguous matches will be routed to the review queue.",
  };
}

export function buildActivationCTAState(args: {
  readiness: ActivationReadiness;
  monthlyImpact: number;
  blockers: number;
  reviewQueue: number;
  confidence: number;
}): { label: string; subtext: string; helper: string; urgencyTone: "low" | "medium" | "high" } {
  const monthlyImpact = Math.max(0, args.monthlyImpact);
  const impactSubtext =
    monthlyImpact > 0
      ? `Modeled monthly capacity: ${formatUsd(monthlyImpact)}`
      : "Establish a measurable baseline during activation";

  if (args.readiness === "READY") {
    return {
      label: "Turn this analysis into a live system",
      subtext: impactSubtext,
      helper: "Nothing has been written yet. Activation starts a controlled import.",
      urgencyTone: "low",
    };
  }

  if (args.readiness === "REVIEW_REQUIRED") {
    return {
      label: "Activate and review your import",
      subtext: `${args.reviewQueue} items are queued for guided review.`,
      helper: "Safe rows can proceed while ambiguous rows remain held.",
      urgencyTone: "medium",
    };
  }

  return {
    label: "Review and activate your migration",
    subtext: `${args.blockers} blocker${args.blockers === 1 ? "" : "s"} must be resolved before trusted go-live.`,
    helper: "Activation begins the real import and holds unsafe rows for review.",
    urgencyTone: "high",
  };
}
