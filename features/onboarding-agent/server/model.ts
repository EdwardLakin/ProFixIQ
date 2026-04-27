import { getOnboardingAgentModel as getCanonicalOnboardingModel } from "@/features/shared/lib/server/openai-models";
import { isOpenAIConfigured } from "@/features/shared/lib/server/openai";

export function getOnboardingAgentModel() {
  return getCanonicalOnboardingModel();
}

export function getOnboardingAgentEnabled() {
  return isOpenAIConfigured();
}
