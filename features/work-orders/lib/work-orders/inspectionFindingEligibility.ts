export type InspectionFindingEligibilityInput = {
  status?: string | null;
  recommend?: boolean | string[] | null;
  recommendation?: string | null;
  recommendationType?: string | null;
};

export type EligibleInspectionJobType =
  | "diagnosis"
  | "repair"
  | "maintenance"
  | "inspection-fail";

const ELIGIBLE_STATUSES = new Set([
  "fail",
  "failed",
  "recommend",
  "recommended",
]);
const INELIGIBLE_STATUSES = new Set([
  "ok",
  "pass",
  "passed",
  "na",
  "n/a",
  "not_applicable",
]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isExplicitInspectionRecommendation(
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

/**
 * Backward-compatible alias used by existing focused tests and callers.
 */
export const isInspectionFindingEligible = isExplicitInspectionRecommendation;

/**
 * Classification is intentionally separate from eligibility. Keyword presence
 * can describe an already eligible finding, but can never make an OK/NA item
 * customer-visible.
 */
export function classifyEligibleInspectionFinding(input: {
  title: string;
  status?: string | null;
}): EligibleInspectionJobType {
  const title = clean(input.title);
  const status = clean(input.status);

  if (
    ["check engine", "diagnose", "diagnostic", "misfire", "no start"].some(
      (keyword) => title.includes(keyword),
    )
  ) {
    return "diagnosis";
  }

  if (status === "fail" || status === "failed") {
    return "inspection-fail";
  }

  if (
    ["oil", "fluid", "filter", "belt", "coolant"].some((keyword) =>
      title.includes(keyword),
    )
  ) {
    return "maintenance";
  }

  return "repair";
}
