import type {
  OptimizationEngineOutput,
  OptimizationOpportunity,
} from "@/features/optimization/types";

export type OnboardingOptimizationAction = {
  id: string;
  type: OptimizationOpportunity["type"];
  title: string;
  summary: string;
  priorityBand: OptimizationOpportunity["priorityBand"];
  confidence: number;
  estimatedValue?: number;
  href: string;
  plannerGoal: string;
};

function toMenuItemPath(menuItemId?: string): string {
  return menuItemId ? `/menu/item/${menuItemId}` : "/menu";
}

function toInspectionTemplatePath(templateId?: string): string {
  return templateId
    ? `/inspections/templates?templateId=${encodeURIComponent(templateId)}`
    : "/inspection_template_suggestions";
}

function toActionHref(opportunity: OptimizationOpportunity): string {
  if (opportunity.type === "pricing_normalization") {
    return toMenuItemPath(opportunity.targetRefs?.menuItemId);
  }

  if (opportunity.type === "inspection_coverage_gap") {
    return opportunity.targetRefs?.inspectionTemplateId
      ? toInspectionTemplatePath(opportunity.targetRefs?.inspectionTemplateId)
      : "/inspection_template_suggestions";
  }

  return "/menu_item_suggestions";
}

function toPlannerGoal(opportunity: OptimizationOpportunity): string {
  if (opportunity.type === "pricing_normalization") {
    return `Standardize pricing: ${opportunity.title}. ${opportunity.summary}`;
  }
  if (opportunity.type === "inspection_coverage_gap") {
    return `Improve inspection coverage: ${opportunity.title}. ${opportunity.summary}`;
  }
  return `Review missed-revenue opportunity: ${opportunity.title}. ${opportunity.summary}`;
}

function rankOpportunity(opportunity: OptimizationOpportunity): number {
  const bandWeight: Record<OptimizationOpportunity["priorityBand"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return (
    bandWeight[opportunity.priorityBand] * 1000 +
    opportunity.priorityScore * 100 +
    (opportunity.estimatedValue ?? 0) / 10
  );
}

export function selectTopOnboardingOptimizationActions(
  payload: OptimizationEngineOutput | null,
  limit = 5,
): OnboardingOptimizationAction[] {
  if (!payload) return [];

  const flattened = payload.groups.flatMap((group) => group.opportunities ?? []);
  const highSignal = flattened
    .filter((opportunity) => {
      if (opportunity.priorityBand === "critical" || opportunity.priorityBand === "high") {
        return true;
      }
      return opportunity.confidence >= 0.65 && opportunity.priorityBand !== "low";
    })
    .sort((a, b) => rankOpportunity(b) - rankOpportunity(a))
    .slice(0, Math.max(1, limit));

  return highSignal.map((opportunity) => ({
    id: opportunity.id,
    type: opportunity.type,
    title: opportunity.title,
    summary: opportunity.summary,
    priorityBand: opportunity.priorityBand,
    confidence: opportunity.confidence,
    estimatedValue: opportunity.estimatedValue,
    href: toActionHref(opportunity),
    plannerGoal: toPlannerGoal(opportunity),
  }));
}
