export type OnboardingSessionStatus =
  | "draft"
  | "files_uploaded"
  | "analyzing_started"
  | "clearing_previous_analysis"
  | "applying_analysis"
  | "analyzing"
  | "analysis_failed"
  | "analysis_ready"
  | "review_required"
  | "activation_ready"
  | "activating"
  | "activated"
  | "blocked"
  | "cancelled";

export function nextStatusFromCounts(input: { fileCount: number; blockingReviewCount: number }): OnboardingSessionStatus {
  if (input.fileCount <= 0) return "draft";
  if (input.blockingReviewCount > 0) return "review_required";
  return "analysis_ready";
}
