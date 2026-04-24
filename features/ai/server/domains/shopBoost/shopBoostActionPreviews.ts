import type { AiRiskTier } from "@/features/ai/server";
import type { ShopBoostRecommendationKind } from "./types";

type ShopBoostPreviewActionType =
  | "review_import_linkage"
  | "review_inspection_template_suggestions"
  | "review_menu_item_suggestions"
  | "review_shop_boost_readiness"
  | "review_roi_opportunities";

const MAP: Record<ShopBoostRecommendationKind, ShopBoostPreviewActionType> = {
  shop_boost_review_unresolved_import_links: "review_import_linkage",
  shop_boost_review_high_confidence_inspection_templates: "review_inspection_template_suggestions",
  shop_boost_review_high_confidence_menu_items: "review_menu_item_suggestions",
  shop_boost_review_low_confidence_suggestions: "review_shop_boost_readiness",
  shop_boost_review_day_one_readiness_gaps: "review_shop_boost_readiness",
  shop_boost_review_roi_opportunities: "review_roi_opportunities",
  shop_boost_review_stale_or_unscoped_suggestions: "review_shop_boost_readiness",
};

export function buildShopBoostPreviewOnlyPayload(input: {
  recommendationId: string;
  intakeId: string;
  recommendationType: ShopBoostRecommendationKind;
  riskTier: AiRiskTier;
}) {
  return {
    action_type: MAP[input.recommendationType],
    recommendation_id: input.recommendationId,
    intake_id: input.intakeId,
    intended_mutations: [] as const,
    side_effects: ["No external side effects. Internal Shop Boost review only."],
    executionBlocked: true as const,
    risk_tier: input.riskTier,
  };
}
