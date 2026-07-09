import type { AiRecommendationRecord } from "@/features/ai/server/types";
import type { Json } from "@shared/types/types/supabase";

function metadataMatchesSession(metadata: Json | null | undefined, sessionId: string): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return metadata.guidedSessionId === sessionId || metadata.sessionId === sessionId;
}

function isOnboardingScopedRecommendation(recommendation: AiRecommendationRecord, sessionId: string): boolean {
  return recommendation.domain === "onboarding" ||
    (recommendation.subject_type === "guided_onboarding_session" && recommendation.subject_id === sessionId) ||
    metadataMatchesSession(recommendation.metadata, sessionId);
}

export function filterGuidedAnalysisRecommendations(
  recommendations: AiRecommendationRecord[],
  sessionId: string,
): AiRecommendationRecord[] {
  const onboardingScoped = recommendations.filter((recommendation) =>
    isOnboardingScopedRecommendation(recommendation, sessionId),
  );

  if (onboardingScoped.length > 0) return onboardingScoped;
  return recommendations.filter((recommendation) => recommendation.domain === "shop_boost");
}
