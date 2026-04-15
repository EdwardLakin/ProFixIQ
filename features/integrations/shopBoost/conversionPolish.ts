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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function buildConfidencePresentation(snapshot: ShadowShopSnapshot): ConfidencePresentation {
  const score = snapshot.projectionConfidence.score;
  const reviewNeeded = snapshot.operationalNarrative.reviewNeededCount;
  const blockers = snapshot.dashboard.blockerCount;

  if (score >= 80 && blockers === 0) {
    return {
      band: "HIGH",
      title: "High confidence",
      explanation: "Based on strong record coverage, low blockers, and stable matching across your uploaded domains.",
      increasesConfidence: "More complete history, customer/vehicle links, and clean identifiers increase confidence.",
      lowersConfidence: "Confidence drops if blocker volume rises or if key identifiers are missing.",
    };
  }

  if (score >= 60) {
    return {
      band: "MODERATE",
      title: "Moderate confidence",
      explanation: "Directional estimate with meaningful signal, but some records still need review before live operational use.",
      increasesConfidence: "Resolving flagged rows and validating parts/customer links will tighten this estimate.",
      lowersConfidence: "Unreviewed record clusters and unresolved blockers keep uncertainty elevated.",
    };
  }

  return {
    band: "EARLY_ESTIMATE",
    title: "Early estimate",
    explanation: "Value is directional while coverage and matching quality are still limited in this preview dataset.",
    increasesConfidence: "Adding missing exports and completing guided review will improve confidence.",
    lowersConfidence: `High review load (${reviewNeeded}) and blocker count (${blockers}) keep this estimate early-stage.`,
  };
}

export function buildConsequenceItems(snapshot: ShadowShopSnapshot): ConsequenceItem[] {
  const items: ConsequenceItem[] = [];
  const reviewNeeded = snapshot.operationalNarrative.reviewNeededCount;
  const blockerCount = snapshot.dashboard.blockerCount;
  const partsConflicts = snapshot.operationalNarrative.partsInventoryConflicts;
  const linkGaps = snapshot.operationalNarrative.unresolvedCustomerVehicleLinks;
  const stalledJobs = snapshot.urgencySignals.stalledJobs;

  if (reviewNeeded > 0) {
    items.push({
      key: "review-needed",
      severity: "warning",
      title: `${reviewNeeded} records need guided review`,
      detail: "Some records require review before they are safe to use in live approvals, invoicing, and service history.",
    });
  }

  if (partsConflicts > 0) {
    items.push({
      key: "parts-conflicts",
      severity: "warning",
      title: `${partsConflicts} parts/inventory conflicts detected`,
      detail: "Inventory counts may not reflect live stock until part mappings and quantities are reviewed.",
    });
  }

  if (linkGaps > 0) {
    items.push({
      key: "link-gaps",
      severity: "warning",
      title: `${linkGaps} customer/vehicle linkage gaps`,
      detail: "Service history may not attach cleanly to the right customer or vehicle until linkage review is complete.",
    });
  }

  if (snapshot.workflowJobs.some((job) => job.status === "blocked")) {
    items.push({
      key: "work-order-linkage",
      severity: "warning",
      title: "Work-order lineage has unresolved gaps",
      detail: "Past jobs may not fully support quoting, approvals, and historical lookup until unresolved links are reviewed.",
    });
  }

  if (blockerCount > 0) {
    items.push({
      key: "blockers",
      severity: "critical",
      title: `${blockerCount} blockers currently prevent trusted go-live`,
      detail: "Your shop is not yet ready for trusted go-live until blocker items are resolved in guided migration review.",
    });
  }

  if (items.length === 0) {
    items.push({
      key: "clean",
      severity: "info",
      title: "No blocker patterns detected in this pass",
      detail: "Most records look ready for guided activation with targeted review on edge cases only.",
    });
  }

  if (stalledJobs > 0) {
    items.push({
      key: "stalled",
      severity: "warning",
      title: `${stalledJobs} jobs are stalled today`,
      detail: "Stalled jobs continue delaying approvals and customer communication until workflow bottlenecks are addressed.",
    });
  }

  return items;
}

function buildTopDrivers(snapshot: ShadowShopSnapshot): string[] {
  return [
    `${snapshot.urgencySignals.stalledJobs} stalled jobs causing handoff friction`,
    `${snapshot.operationalNarrative.unresolvedCustomerVehicleLinks} customer/vehicle link gaps`,
    `${snapshot.operationalNarrative.partsInventoryConflicts} parts reconciliation issues`,
  ].filter((entry) => !entry.startsWith("0 "));
}

export function buildDecisionSummary(context: ShadowPreviewContext): DecisionSummary {
  const { snapshot, shopName } = context;
  const confidence = buildConfidencePresentation(snapshot);
  const recoverableValue = Math.max(0, snapshot.roi.estimated_monthly_impact);
  const monthlyValueAtRisk = Math.max(snapshot.urgencySignals.revenueAtRiskNow, Math.round(recoverableValue * 0.6));
  const blockers = snapshot.dashboard.blockerCount;

  const readinessSummary = blockers > 0
    ? "Activation is possible, but blocker resolution is required before trusted go-live."
    : snapshot.dashboard.reviewQueueCount > 0
      ? "Activation can proceed with guided review before full live confidence."
      : "Dataset appears ready for controlled activation and guided import.";

  return {
    heading: "What your data says right now",
    summary: `Your data suggests ${shopName} is currently losing approximately ${formatUsd(monthlyValueAtRisk)}/month from workflow friction, delayed approvals, and unresolved migration gaps.`,
    monthlyValueAtRisk,
    recoverableValue,
    topDrivers: buildTopDrivers(snapshot).slice(0, 3),
    readinessSummary,
    blockerSummary: blockers > 0
      ? `${blockers} blocker${blockers === 1 ? "" : "s"} must be resolved during guided migration review.`
      : "No hard blockers detected in this preview pass.",
    confidence,
    primaryActionLabel: blockers > 0 ? "Review and activate your migration" : "Start fixing these issues",
    primaryActionHelper: blockers > 0
      ? "Activation starts a real import with held-review controls for unsafe rows."
      : `Estimated recoverable value after activation: ${formatUsd(recoverableValue)}/month.`,
    secondaryActionLabel: "Share this findings report",
  };
}

export function buildStakeholderTakeaways(snapshot: ShadowShopSnapshot): StakeholderTakeaway[] {
  return [
    {
      role: "owner",
      label: "Recommended next step for the owner",
      message: `Activate guided migration to recover up to ${formatUsd(snapshot.roi.estimated_monthly_impact)}/month while maintaining review control before go-live.`,
    },
    {
      role: "manager",
      label: "Manager takeaway",
      message: `${snapshot.operationalNarrative.reviewNeededCount} records need review and ${snapshot.urgencySignals.stalledJobs} jobs are stalled, so queue cleanup should be prioritized during activation.`,
    },
    {
      role: "advisor",
      label: "Advisor/service-writer impact",
      message: `${snapshot.operationalNarrative.unresolvedCustomerVehicleLinks} linkage gaps may affect quoting and history confidence until guided review is completed.`,
    },
  ];
}

export function buildObjectionHandlingContent(snapshot: ShadowShopSnapshot): ObjectionHandlingContent {
  const blockerCount = snapshot.dashboard.blockerCount;
  const reviewQueue = snapshot.dashboard.reviewQueueCount;

  return {
    title: "How activation stays safe",
    bullets: [
      "Preview data is read-only and has not created a live shop workspace yet.",
      "Activation starts a real import process, not a blind overwrite.",
      "Flagged and ambiguous rows are held for guided review instead of silently written live.",
      "You stay in control of go-live timing while review queues are cleared.",
      blockerCount > 0
        ? `${blockerCount} blocker${blockerCount === 1 ? " is" : "s are"} currently tracked and surfaced explicitly before trusted go-live.`
        : "No blocker pattern is currently forcing hard stop conditions.",
    ],
    whyReviewExists: reviewQueue > 0
      ? `Why some items need review: ${reviewQueue} records have missing identifiers or ambiguous matches that require confirmation before safe operational use.`
      : "Why some items need review: edge cases are queued when matching confidence is below trusted thresholds.",
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
  if (args.readiness === "READY") {
    return {
      label: "Turn this analysis into a live system",
      subtext: `Estimated recoverable value: ${formatUsd(monthlyImpact)}/month`,
      helper: "Nothing has been written yet. Activation starts a controlled import.",
      urgencyTone: "low",
    };
  }

  if (args.readiness === "REVIEW_REQUIRED") {
    return {
      label: "Start fixing these issues",
      subtext: `${args.reviewQueue} records are queued for guided review before go-live.`,
      helper: `Estimated recoverable value: ${formatUsd(monthlyImpact)}/month. You review flagged records before live use.`,
      urgencyTone: "medium",
    };
  }

  return {
    label: "Review and activate your migration",
    subtext: `${args.blockers} blocker${args.blockers === 1 ? "" : "s"} must be resolved before trusted go-live.`,
    helper: "Activation begins real import and holds unsafe rows for review instead of blind writes.",
    urgencyTone: "high",
  };
}
