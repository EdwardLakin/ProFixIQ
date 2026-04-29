export type OnboardingSessionAction = "analyze" | "rerun";
export type OnboardingSessionActivationAction = "activate";

export function onboardingSessionActionPath(sessionId: string, action: OnboardingSessionAction) {
  return `/api/onboarding-agent/sessions/${sessionId}/${action}`;
}

export function onboardingSessionActivationPath(sessionId: string, action: OnboardingSessionActivationAction = "activate") {
  return `/api/onboarding-agent/sessions/${sessionId}/${action}`;
}
