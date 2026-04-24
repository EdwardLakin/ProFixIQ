import type { AiRecommendationPriority, AiRiskTier } from "@/features/ai/server/types";

export const SHOP_BOOST_RULES_VERSION = "shop_boost_rules_v1";

export type ShopBoostRecommendationKind =
  | "shop_boost_review_unresolved_import_links"
  | "shop_boost_review_high_confidence_inspection_templates"
  | "shop_boost_review_high_confidence_menu_items"
  | "shop_boost_review_low_confidence_suggestions"
  | "shop_boost_review_day_one_readiness_gaps"
  | "shop_boost_review_roi_opportunities"
  | "shop_boost_review_stale_or_unscoped_suggestions";

export type ShopBoostRecommendationRisk = AiRiskTier;

export type ShopBoostAiEvidence = {
  shopId: string;
  intakeId: string;
  sourceRunId: string | null;
  activationStatus: string | null;
  readinessStatus: string | null;
  generatedAt: string;
  confidence: number;
  confidenceSummary: {
    trustScore: number | null;
    trustMessage: string | null;
    confidenceScore: number | null;
  };
  linkageSummary: {
    customersLinked: number | null;
    vehiclesLinked: number | null;
    workOrdersLinked: number | null;
    invoicesLinked: number | null;
    unresolvedCustomers: number | null;
    unresolvedVehicles: number | null;
    unresolvedWorkOrders: number | null;
    unresolvedInvoices: number | null;
  };
  suggestionsSummary: {
    inspectionTemplateSuggestions: number | null;
    inspectionTemplateHighConfidenceCount: number | null;
    menuItemSuggestions: number | null;
    menuItemHighConfidenceCount: number | null;
    staffSuggestions: number | null;
    customerSuggestions: number | null;
    historySuggestions: number | null;
    highConfidenceCount: number;
    reviewNeededCount: number;
  };
  roiImpactSummary: {
    estimatedMonthlyImpact: number | null;
    approvalSpeedGain: number | null;
    laborRecoveryHours: number | null;
    partsLeakageReduction: number | null;
    confidence: number | null;
  };
  unresolvedDataCategories: string[];
  staleOrUnscopedSuggestionWarnings: string[];
  sourceRefs: Array<{ table: string; id?: string; path?: string; field?: string }>;
  missingData: string[];
};

export type ShopBoostPostActivationRecommendation = {
  recommendation_type: ShopBoostRecommendationKind;
  title: string;
  summary: string;
  priority: AiRecommendationPriority;
  confidence: number;
  risk_tier: ShopBoostRecommendationRisk;
  evidence_snapshot_id: string;
  missing_data: string[];
  recommended_action: {
    type:
      | "review_import_linkage"
      | "review_inspection_template_suggestions"
      | "review_menu_item_suggestions"
      | "review_shop_boost_readiness"
      | "review_roi_opportunities";
    label: string;
    details: string;
  };
  side_effects: [];
  requires_approval: false;
  metadata: {
    intakeId: string;
    sourceRunId: string | null;
    recommendationKind: ShopBoostRecommendationKind;
    advisory_only: true;
    rule_version: string;
  };
  source: "shop_boost_post_activation_rules";
  expires_at: string;
};
