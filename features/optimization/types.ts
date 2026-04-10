export type OptimizationType =
  | "pricing_normalization"
  | "inspection_coverage_gap"
  | "missed_revenue";

export type OptimizationImpactLevel = "low" | "medium" | "high";

export type OptimizationTargetRef = {
  entityType:
    | "menu_item"
    | "work_order"
    | "work_order_line"
    | "inspection_template"
    | "service_family"
    | "service_pair";
  id: string;
  label?: string;
};

export type OptimizationOpportunity = {
  id: string;
  type: OptimizationType;
  title: string;
  summary: string;
  confidence: number;
  impactLevel: OptimizationImpactLevel;
  estimatedValue?: number;
  priorityScore: number;
  priorityBand: "low" | "medium" | "high" | "critical";
  reasoning: string[];
  sourceBasis: string;
  whyNow?: string;
  confidenceLabel?: string;
  impactLabel?: string;
  relatedIds?: string[];
  suggestedAction?: string;
  targetRefs?: {
    menuItemId?: string;
    inspectionTemplateId?: string;
  };
  meta?: Record<string, unknown>;
};

export type OptimizationGroup = {
  groupKey: string;
  type: OptimizationType;
  opportunities: OptimizationOpportunity[];
  totalEstimatedValue?: number;
  avgConfidence: number;
};

export type OptimizationEngineOutput = {
  generatedAt: string;
  shopId: string;
  summary: {
    totalOpportunities: number;
    criticalCount: number;
    highCount: number;
    potentialMonthlyValue: number;
    lastAnalyzedAt: string;
    dataFreshness: "fresh" | "stale";
  };
  groups: OptimizationGroup[];
};

export type OptimizationActionType = "pricing" | "inspection" | "revenue";

export type OptimizationApplyPayload = {
  menuItemId?: string;
  newPrice?: number;
  newLaborHours?: number;
  inspectionTemplate?: unknown;
  suggestionData?: unknown;
};

export type OptimizationExecutionType =
  | "pricing_normalization"
  | "inspection_gap"
  | "missed_revenue";

export type ExecutionPreview = {
  type: OptimizationActionType;
  changes: Array<{
    label: string;
    before?: unknown;
    after?: unknown;
  }>;
  warnings?: string[];
};
