import type { ShopBoostAiEvidence, ShopBoostPostActivationRecommendation } from "./types";
import { SHOP_BOOST_RULES_VERSION } from "./types";

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function defaultExpiresAt(days = 5): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function recommendationBase(input: {
  evidence: ShopBoostAiEvidence;
  evidenceSnapshotId: string;
  recommendation: Omit<ShopBoostPostActivationRecommendation, "evidence_snapshot_id" | "missing_data" | "metadata" | "source" | "expires_at">;
}): ShopBoostPostActivationRecommendation {
  return {
    ...input.recommendation,
    confidence: clampConfidence(input.recommendation.confidence),
    evidence_snapshot_id: input.evidenceSnapshotId,
    missing_data: input.evidence.missingData,
    source: "shop_boost_post_activation_rules",
    metadata: {
      intakeId: input.evidence.intakeId,
      sourceRunId: input.evidence.sourceRunId,
      recommendationKind: input.recommendation.recommendation_type,
      advisory_only: true,
      rule_version: SHOP_BOOST_RULES_VERSION,
    },
    expires_at: defaultExpiresAt(5),
  };
}

export function buildShopBoostPostActivationRecommendations(input: {
  evidence: ShopBoostAiEvidence;
  evidenceSnapshotId: string;
}): ShopBoostPostActivationRecommendation[] {
  const { evidence, evidenceSnapshotId } = input;
  const recs: ShopBoostPostActivationRecommendation[] = [];

  const unresolvedTotal =
    (evidence.linkageSummary.unresolvedCustomers ?? 0) +
    (evidence.linkageSummary.unresolvedVehicles ?? 0) +
    (evidence.linkageSummary.unresolvedWorkOrders ?? 0) +
    (evidence.linkageSummary.unresolvedInvoices ?? 0);

  if (unresolvedTotal > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_unresolved_import_links",
          title: "Review unresolved Shop Boost import linkage",
          summary: `${unresolvedTotal} unresolved linkage signal(s) were detected across imported records and should be reviewed before relying on migrated history.`,
          priority: unresolvedTotal >= 10 ? "high" : "normal",
          risk_tier: "medium",
          confidence: evidence.confidence,
          recommended_action: {
            type: "review_import_linkage",
            label: "Review import linkage",
            details: "Review unresolved linkage in Shop Boost review queue. No data is auto-imported or materialized.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if ((evidence.suggestionsSummary.inspectionTemplateHighConfidenceCount ?? 0) > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_high_confidence_inspection_templates",
          title: "Review high-confidence inspection template suggestions",
          summary: `${evidence.suggestionsSummary.inspectionTemplateHighConfidenceCount} high-confidence inspection template suggestion(s) are ready for owner/admin review.`,
          priority: "normal",
          risk_tier: "low",
          confidence: Math.max(0.8, evidence.confidence),
          recommended_action: {
            type: "review_inspection_template_suggestions",
            label: "Review inspection template suggestions",
            details: "Review suggestions in Shop Boost. This is advisory only and does not auto-create templates.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if ((evidence.suggestionsSummary.menuItemHighConfidenceCount ?? 0) > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_high_confidence_menu_items",
          title: "Review high-confidence menu item suggestions",
          summary: `${evidence.suggestionsSummary.menuItemHighConfidenceCount} high-confidence menu item suggestion(s) are ready for owner/admin review.`,
          priority: "normal",
          risk_tier: "low",
          confidence: Math.max(0.8, evidence.confidence),
          recommended_action: {
            type: "review_menu_item_suggestions",
            label: "Review menu item suggestions",
            details: "Review suggestions in Shop Boost. This is advisory only and does not auto-create menu items.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if ((evidence.suggestionsSummary.reviewNeededCount ?? 0) > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_low_confidence_suggestions",
          title: "Review low-confidence Shop Boost suggestions",
          summary: `${evidence.suggestionsSummary.reviewNeededCount} suggestion(s) still need manual review before any manual materialization decisions.`,
          priority: "high",
          risk_tier: "medium",
          confidence: 0.78,
          recommended_action: {
            type: "review_shop_boost_readiness",
            label: "Review Shop Boost readiness",
            details: "Review low-confidence records and blockers in the existing Shop Boost review UI.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if (evidence.readinessStatus === "BLOCKED" || evidence.activationStatus === "blocked" || evidence.activationStatus === "not_eligible") {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_day_one_readiness_gaps",
          title: "Review Shop Boost day-one readiness gaps",
          summary: "Activation/readiness signals indicate unresolved setup blockers that should be reviewed by an owner/admin.",
          priority: "high",
          risk_tier: "high",
          confidence: 0.85,
          recommended_action: {
            type: "review_shop_boost_readiness",
            label: "Review readiness blockers",
            details: "Use the Shop Boost readiness/report views to resolve blockers. No automatic activation changes are performed.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if ((evidence.roiImpactSummary.estimatedMonthlyImpact ?? 0) > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_roi_opportunities",
          title: "Review Shop Boost ROI opportunities",
          summary: `Shop Boost estimated potential monthly impact of $${Math.round(evidence.roiImpactSummary.estimatedMonthlyImpact ?? 0).toLocaleString()} from operational improvements.`,
          priority: "normal",
          risk_tier: "low",
          confidence: clampConfidence(evidence.roiImpactSummary.confidence ?? evidence.confidence),
          recommended_action: {
            type: "review_roi_opportunities",
            label: "Review ROI opportunities",
            details: "Review impact assumptions and prioritize internal setup follow-through tasks.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  if (evidence.staleOrUnscopedSuggestionWarnings.length > 0) {
    recs.push(
      recommendationBase({
        evidence,
        evidenceSnapshotId,
        recommendation: {
          recommendation_type: "shop_boost_review_stale_or_unscoped_suggestions",
          title: "Review stale or unscoped Shop Boost suggestions",
          summary: "Suggestion freshness/scoping warnings were detected and should be confirmed before acting on recommendations.",
          priority: "normal",
          risk_tier: "medium",
          confidence: 0.74,
          recommended_action: {
            type: "review_shop_boost_readiness",
            label: "Review suggestion freshness",
            details: "Confirm suggestion freshness and scope in Shop Boost review surfaces before any manual follow-up.",
          },
          side_effects: [],
          requires_approval: false,
        },
      }),
    );
  }

  return recs;
}
