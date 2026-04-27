export type OnboardingSessionAction = "analyze" | "rerun";

export function onboardingSessionActionPath(sessionId: string, action: OnboardingSessionAction) {
  return `/api/onboarding-agent/sessions/${sessionId}/${action}`;
}

