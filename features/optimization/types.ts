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
  optimizationType: OptimizationType;
  title: string;
  summary: string;
  confidence: number;
  impactLevel: OptimizationImpactLevel;
  estimatedValue?: number;
  sourceBasis: string[];
  suggestedAction: string;
  targetRefs: OptimizationTargetRef[];
  meta?: Record<string, unknown>;
};

export type OptimizationEngineOutput = {
  generatedAt: string;
  shopId: string;
  opportunities: OptimizationOpportunity[];
};
