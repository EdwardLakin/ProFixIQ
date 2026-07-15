export type InspectionFindingEligibilityInput = {
  status?: string | null;
  recommend?: boolean | string[] | null;
  recommendation?: string | null;
  recommendationType?: string | null;
};

const ELIGIBLE_STATUSES = new Set(["fail", "failed", "recommend", "recommended"]);
const INELIGIBLE_STATUSES = new Set(["ok", "pass", "passed", "na", "n/a", "not_applicable"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Determines whether an inspection observation is eligible to become a
 * customer-visible quote recommendation. Classification keywords must only be
 * applied after this function returns true.
 */
export function isInspectionFindingEligible(
  input: InspectionFindingEligibilityInput,
): boolean {
  const status = clean(input.status);

  if (ELIGIBLE_STATUSES.has(status)) return true;
  if (INELIGIBLE_STATUSES.has(status)) return false;
  if (input.recommend === true) return true;
  if (Array.isArray(input.recommend) && input.recommend.length > 0) return true;

  const recommendation = clean(input.recommendation);
  const recommendationType = clean(input.recommendationType);
  return recommendation.length > 0 || recommendationType.length > 0;
}
