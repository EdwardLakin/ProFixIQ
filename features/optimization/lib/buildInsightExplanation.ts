import type {
  EvidenceItem,
  OptimizationOpportunity,
  StoryOpportunityExplanation,
  UnifiedInsightExplanation,
} from "@/features/optimization/types";

function toNum(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function compactEvidence(items: Array<EvidenceItem | null>): EvidenceItem[] {
  return items.filter((item): item is EvidenceItem => item !== null);
}

function pricingEvidence(opportunity: OptimizationOpportunity): EvidenceItem[] {
  const meta = opportunity.meta ?? {};
  const jobs = toNum(meta.jobsAnalyzed);
  const recommendedPrice = toNum(meta.recommendedPrice);
  const underpricedOutliers = toNum(meta.underpricedOutliers);
  const overpricedOutliers = toNum(meta.overpricedOutliers);

  return compactEvidence([
    jobs ? { label: "Jobs analyzed", value: jobs, kind: "metric" } : null,
    recommendedPrice ? { label: "Median recommended price", value: `$${recommendedPrice.toFixed(2)}`, kind: "comparison" } : null,
    underpricedOutliers != null
      ? { label: "Underpriced outliers", value: underpricedOutliers, kind: "pattern" }
      : null,
    overpricedOutliers != null
      ? { label: "Overpriced outliers", value: overpricedOutliers, kind: "pattern" }
      : null,
  ]);
}

function coverageEvidence(opportunity: OptimizationOpportunity): EvidenceItem[] {
  const meta = opportunity.meta ?? {};
  const jobs = toNum(meta.jobs);
  const coverageRate = toNum(meta.coverageRate);
  const linkedRate = toNum(meta.inspectionLinkedRate);

  return compactEvidence([
    jobs ? { label: "Jobs mapped", value: jobs, kind: "metric" } : null,
    coverageRate != null ? { label: "Inspection linkage", value: toPct(coverageRate), kind: "status" } : null,
    linkedRate != null ? { label: "Template link rate", value: toPct(linkedRate), kind: "comparison" } : null,
  ]);
}

function revenueEvidence(opportunity: OptimizationOpportunity): EvidenceItem[] {
  const meta = opportunity.meta ?? {};
  const sourceFamilyCount = toNum(meta.sourceFamilyCount);
  const pairCount = toNum(meta.pairCount);
  const missingCount = toNum(meta.missingCount) ?? toNum(meta.missingCapturedRecommendations);
  const findings = toNum(meta.flaggedFindings);

  return compactEvidence([
    sourceFamilyCount ? { label: "Anchor-family jobs", value: sourceFamilyCount, kind: "metric" } : null,
    pairCount ? { label: "Companion captures", value: pairCount, kind: "pattern" } : null,
    missingCount != null ? { label: "Likely misses", value: missingCount, kind: "comparison" } : null,
    findings ? { label: "Flagged findings reviewed", value: findings, kind: "event" } : null,
  ]);
}

function toStorySignal(opportunity: OptimizationOpportunity): StoryOpportunityExplanation {
  const meta = opportunity.meta ?? {};
  if (opportunity.type === "inspection_coverage_gap") {
    const coverageRate = toNum(meta.coverageRate) ?? 1;
    const jobs = toNum(meta.jobs) ?? 0;
    const isStrongSignal = opportunity.confidence >= 0.68 && coverageRate <= 0.45 && jobs >= 10;

    if (!isStrongSignal) {
      return { isStoryWorthy: false };
    }

    return {
      isStoryWorthy: true,
      angle: "Consistent inspection proof builds customer trust before approvals",
      whyStoryWorthy: [
        `Repeat service family shows only ${toPct(coverageRate)} inspection linkage`,
        "Closing the gap creates stronger maintenance education moments",
      ],
      suggestedAudience: "Vehicle owners and fleet coordinators",
      suggestedFormat: "trust_proof",
    };
  }

  if (opportunity.type === "missed_revenue" && opportunity.id.includes("inspection-finding-gaps")) {
    const findingMisses = toNum(meta.missingCapturedRecommendations) ?? 0;
    const flagged = toNum(meta.flaggedFindings) ?? 0;

    if (opportunity.confidence >= 0.72 && flagged >= 10 && findingMisses >= 4) {
      return {
        isStoryWorthy: true,
        angle: "Safety findings converted into transparent repair decisions",
        whyStoryWorthy: [
          `${findingMisses} flagged findings lacked matching service lines`,
          "Strong before/after education opportunity when findings are documented",
        ],
        suggestedAudience: "Safety-focused customers",
        suggestedFormat: "educational",
      };
    }
  }

  return { isStoryWorthy: false };
}

export function buildInsightExplanation(opportunity: OptimizationOpportunity): UnifiedInsightExplanation {
  const evidence =
    opportunity.type === "pricing_normalization"
      ? pricingEvidence(opportunity)
      : opportunity.type === "inspection_coverage_gap"
        ? coverageEvidence(opportunity)
        : revenueEvidence(opportunity);

  const riskIfIgnored =
    opportunity.type === "pricing_normalization"
      ? "Quote variance can erode margin consistency and customer trust in similar repairs."
      : opportunity.type === "inspection_coverage_gap"
        ? "Low inspection linkage can weaken approval confidence and reduce trust-proof evidence."
        : "Missed companion recommendations can suppress captured revenue and leave needed work undocumented.";

  const expectedOutcome =
    opportunity.type === "pricing_normalization"
      ? "More predictable estimates and tighter gross-margin control."
      : opportunity.type === "inspection_coverage_gap"
        ? "Higher inspection-backed approval quality with clearer advisor conversations."
        : "Improved average RO value from consistently captured related work.";

  return {
    operational: {
      summary: opportunity.summary,
      bullets: opportunity.reasoning.slice(0, 4),
      evidence,
      riskIfIgnored,
      expectedOutcome,
      confidenceNote: opportunity.confidenceLabel ?? `${Math.round(opportunity.confidence * 100)}% confidence signal`,
    },
    story: toStorySignal(opportunity),
  };
}
