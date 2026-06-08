import { GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep } from "./steps";
import type { GuidedOnboardingProgress, GuidedOnboardingSessionDetail, GuidedOnboardingSessionRow, GuidedOnboardingStepRow } from "./types";

export function orderGuidedSteps<T extends { step_key: string }>(steps: T[]): T[] {
  const orderByKey = new Map(GUIDED_ONBOARDING_STEPS.map((step) => [step.key, step.order]));
  return [...steps].sort((a, b) => (orderByKey.get(a.step_key as never) ?? 9999) - (orderByKey.get(b.step_key as never) ?? 9999));
}

export function calculateGuidedProgress(steps: Pick<GuidedOnboardingStepRow, "status">[]): GuidedOnboardingProgress {
  const total = GUIDED_ONBOARDING_STEPS.length;
  const completed = steps.filter((step) => step.status === "completed").length;
  const skipped = steps.filter((step) => step.status === "skipped").length;
  const inProgress = steps.filter((step) => step.status === "in_progress").length;
  return {
    total,
    completed,
    skipped,
    inProgress,
    percent: total === 0 ? 0 : Math.round(((completed + skipped) / total) * 100),
  };
}

export function findNextGuidedStepKey(steps: Pick<GuidedOnboardingStepRow, "step_key" | "status">[]) {
  const ordered = orderGuidedSteps(steps);
  return ordered.find((step) => step.status !== "completed" && step.status !== "skipped")?.step_key ?? null;
}

export function buildGuidedSessionDetail(
  session: GuidedOnboardingSessionRow,
  steps: GuidedOnboardingStepRow[],
): GuidedOnboardingSessionDetail {
  const orderedSteps = orderGuidedSteps(steps);
  const currentStepKey = session.current_step_key ?? findNextGuidedStepKey(orderedSteps);
  return {
    session,
    steps: orderedSteps,
    currentStep: getGuidedOnboardingStep(currentStepKey),
    progress: calculateGuidedProgress(orderedSteps),
  };
}
