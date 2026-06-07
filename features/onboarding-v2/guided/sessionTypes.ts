import type { GuidedOnboardingStepKey } from "@/features/onboarding-v2/guided/steps";

export type GuidedStepSessionStatus = "not_started" | "in_progress" | "complete" | "skipped";
export type GuidedSessionStatus = "active" | "complete";

export type GuidedStepSessionState = {
  status: GuidedStepSessionStatus;
  answers: Record<string, unknown>;
  updatedAt: string;
  completedAt?: string;
  skippedAt?: string;
};

export type GuidedOnboardingSessionState = {
  version: 1;
  sessionStatus: GuidedSessionStatus;
  currentStepKey: GuidedOnboardingStepKey;
  existingSystem: string | null;
  steps: Partial<Record<GuidedOnboardingStepKey, GuidedStepSessionState>>;
};

export type GuidedOnboardingSessionPayload = {
  id: string;
  shopId: string;
  createdBy: string | null;
  status: string;
  source: string | null;
  title: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  guided: GuidedOnboardingSessionState;
};
