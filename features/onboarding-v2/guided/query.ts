import { GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep } from "./steps";
import type { GuidedOnboardingProgress, GuidedOnboardingSessionDetail, GuidedOnboardingSessionRow, GuidedOnboardingStepRow } from "./types";

export function orderGuidedSteps<T extends { step_key: string }>(steps: T[]): T[] {
  const orderByKey = new Map(GUIDED_ONBOARDING_STEPS.map((step) => [step.key, step.order]));
  return [...steps].sort((a, b) => (orderByKey.get(a.step_key as never) ?? 9999) - (orderByKey.get(b.step_key as never) ?? 9999));
}

export function calculateGuidedProgress(steps: Pick<GuidedOnboardingStepRow, "step_key" | "status">[]): GuidedOnboardingProgress {
  const canonicalKeys = new Set(GUIDED_ONBOARDING_STEPS.map((step) => step.key));
  const visibleSteps = steps.filter((step) => canonicalKeys.has(step.step_key as never));
  const total = GUIDED_ONBOARDING_STEPS.length;
  const completed = visibleSteps.filter((step) => step.status === "completed").length;
  const skipped = visibleSteps.filter((step) => step.status === "skipped").length;
  const inProgress = visibleSteps.filter((step) => step.status === "in_progress").length;
  return {
    total,
    completed,
    skipped,
    inProgress,
    percent: total === 0 ? 0 : Math.round(((completed + skipped) / total) * 100),
  };
}

export function findNextGuidedStepKey(steps: Pick<GuidedOnboardingStepRow, "step_key" | "status">[]) {
  const canonicalKeys = new Set(GUIDED_ONBOARDING_STEPS.map((step) => step.key));
  const ordered = orderGuidedSteps(steps).filter((step) => canonicalKeys.has(step.step_key as never));
  return ordered.find((step) => step.status !== "completed" && step.status !== "skipped")?.step_key ?? null;
}

export function buildGuidedSessionDetail(
  session: GuidedOnboardingSessionRow,
  steps: GuidedOnboardingStepRow[],
): GuidedOnboardingSessionDetail {
  const canonicalKeys = new Set(GUIDED_ONBOARDING_STEPS.map((step) => step.key));
  const orderedSteps = orderGuidedSteps(steps).filter((step) => canonicalKeys.has(step.step_key as never));
  const currentStepKey = session.current_step_key ?? findNextGuidedStepKey(orderedSteps);
  return {
    session,
    steps: orderedSteps,
    currentStep: getGuidedOnboardingStep(currentStepKey),
    progress: calculateGuidedProgress(orderedSteps),
  };
}


// Compatibility for restored guided setup cards from the original guided UI.
export type GuidedOnboardingQuery = {
  onboardingSession: string;
  onboardingStep: string;
  highlight: string;
  returnTo: string;
  source?: string;
};

export function isSafeGuidedReturnTo(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("://");
}

export function parseGuidedOnboardingQuery(params: URLSearchParams): GuidedOnboardingQuery | null {
  const onboardingSession = params.get("onboardingSession") ?? params.get("guidedSessionId") ?? "";
  const onboardingStep = params.get("onboardingStep") ?? params.get("guidedStep") ?? "";
  const highlight = params.get("highlight") ?? "";
  const rawReturnTo = params.get("returnTo") ?? "/dashboard/onboarding-v2";
  const source = params.get("source") ?? "guided-onboarding-v2";

  if (!onboardingSession || !onboardingStep || !highlight) return null;

  return {
    onboardingSession,
    onboardingStep,
    highlight,
    returnTo: isSafeGuidedReturnTo(rawReturnTo) ? rawReturnTo : "/dashboard/onboarding-v2",
    source,
  };
}
