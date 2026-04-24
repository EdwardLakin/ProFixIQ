import type { AiActorContext, AiRecommendationPriority, AiRecommendationStatus, AiRiskTier, AiServerClient } from "@/features/ai/server/types";

export type AiMissionControlRecommendation = {
  id: string;
  domain: "work_orders" | "shop_boost";
  domainLabel: "Work order" | "Shop Boost";
  recommendationType: string;
  subjectType: string;
  subjectId: string | null;
  title: string;
  summary: string | null;
  status: AiRecommendationStatus;
  priority: AiRecommendationPriority;
  riskTier: AiRiskTier;
  confidence: number | null;
  missingDataCount: number;
  requiresApproval: boolean;
  requiresOwnerPin: boolean;
  createdAt: string;
  expiresAt: string | null;
  recommendedActionType: string | null;
  recommendedActionLabel: string | null;
  previewCount: number;
  href: string | null;
};

export type AiMissionControlSummary = {
  totalOpen: number;
  totalAcknowledged: number;
  urgentCount: number;
  highCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  staleCount: number;
  missingDataCount: number;
  workOrdersNeedingAttention: number;
  totalPreviewCount: number;
  pendingApprovalCount: number;
  recommendations: AiMissionControlRecommendation[];
  generatedAt: string;
};

export type GetAiMissionControlSummaryInput = {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  domains?: Array<"work_orders" | "shop_boost">;
  limit?: number;
};
