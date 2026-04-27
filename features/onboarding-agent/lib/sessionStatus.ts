// TODO(onboarding-agent-phase2): shrink compatibility aliases once production data is fully normalized.
export const ONBOARDING_SESSION_ALLOWED_STATUSES = [
  "draft",
  "files_uploaded",
  "uploaded",
  "analyzing",
  "analyzing_started",
  "clearing_previous_analysis",
  "applying_analysis",
  "analysis_ready",
  "review_required",
  "ready_for_dry_run",
  "ready_for_activation",
  "activation_ready",
  "activating",
  "activated",
  "blocked",
  "cancelled",
  "deleted",
  "analysis_failed",
] as const;

export type OnboardingSessionStatus = (typeof ONBOARDING_SESSION_ALLOWED_STATUSES)[number];

export function isOnboardingSessionStatus(value: unknown): value is OnboardingSessionStatus {
  return typeof value === "string" && ONBOARDING_SESSION_ALLOWED_STATUSES.includes(value as OnboardingSessionStatus);
}

export function formatOnboardingSessionStatusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function nextStatusFromCounts(input: { fileCount: number; blockingReviewCount: number }): OnboardingSessionStatus {
  if (input.fileCount <= 0) return "draft";
  if (input.blockingReviewCount > 0) return "review_required";
  return "analysis_ready";
}
