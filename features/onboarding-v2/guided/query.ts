import {
  GUIDED_ONBOARDING_SOURCE,
  getGuidedOnboardingStep,
  isGuidedOnboardingStepKey,
  type GuidedOnboardingStepKey,
} from "./steps";

export type GuidedOnboardingQuery = {
  onboardingSession: string;
  onboardingStep: GuidedOnboardingStepKey;
  highlight: string;
  returnTo: string;
  source: typeof GUIDED_ONBOARDING_SOURCE;
};

export function isSafeGuidedReturnTo(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "https://profixiq.local");
    return parsed.origin === "https://profixiq.local" && parsed.pathname.startsWith("/");
  } catch {
    return false;
  }
}

export function sanitizeGuidedReturnTo(value: string | null | undefined, fallback = "/dashboard/onboarding-v2"): string {
  return isSafeGuidedReturnTo(value) ? value : fallback;
}

export function buildGuidedOnboardingReturnTo(sessionId: string): string {
  return `/dashboard/onboarding-v2/${encodeURIComponent(sessionId)}`;
}

export function buildGuidedOnboardingDestinationUrl(args: {
  sessionId: string;
  stepKey: GuidedOnboardingStepKey;
  returnTo?: string;
}): string {
  const step = getGuidedOnboardingStep(args.stepKey);
  const params = new URLSearchParams({
    onboardingSession: args.sessionId,
    onboardingStep: step.stepKey,
    highlight: step.highlightKey,
    returnTo: sanitizeGuidedReturnTo(args.returnTo, buildGuidedOnboardingReturnTo(args.sessionId)),
    source: GUIDED_ONBOARDING_SOURCE,
  });
  return `${step.destinationPath}?${params.toString()}`;
}

export function parseGuidedOnboardingQuery(params: URLSearchParams): GuidedOnboardingQuery | null {
  const source = params.get("source");
  const onboardingSession = params.get("onboardingSession") ?? "";
  const onboardingStep = params.get("onboardingStep") ?? "";
  const highlight = params.get("highlight") ?? "";
  const returnTo = params.get("returnTo") ?? "";

  if (source !== GUIDED_ONBOARDING_SOURCE) return null;
  if (!onboardingSession) return null;
  if (!isGuidedOnboardingStepKey(onboardingStep)) return null;
  if (!highlight) return null;
  if (!isSafeGuidedReturnTo(returnTo)) return null;

  return { onboardingSession, onboardingStep, highlight, returnTo, source };
}
