export const ONBOARDING_AGENT_PLAN_VERSION = "onboarding_agent_plan_v1" as const;

export type OnboardingAgentPlanDomain =
  | "customers"
  | "vehicles"
  | "history"
  | "invoices"
  | "parts"
  | "vendors"
  | "staff"
  | "menu"
  | "inspections"
  | "unknown";

export type OnboardingAgentPlanMode = "ai_planned" | "deterministic_fallback";

export type EntityPlanSummary = {
  staged: number;
  ready: number;
  review: number;
  confidence: number;
  notes: string[];
};

export type OnboardingAgentPlan = {
  version: typeof ONBOARDING_AGENT_PLAN_VERSION;
  mode: OnboardingAgentPlanMode;
  model?: string;
  liveRecordsCreated: 0;
  confidence: number;
  summary: string;
  files: Array<{
    fileId: string;
    filename: string;
    inferredDomain: OnboardingAgentPlanDomain;
    confidence: number;
    reasoning: string;
    headerMap: Record<string, string>;
    requiredFieldsPresent: string[];
    missingImportantFields: string[];
    rowCountEstimate: number;
    recommendedParserMode: "stage_entities" | "stage_review_only" | "ignore" | "unsupported";
  }>;
  entityPlan: {
    customers: EntityPlanSummary;
    vehicles: EntityPlanSummary;
    historicalWorkOrders: EntityPlanSummary;
    historicalInvoices: EntityPlanSummary;
    parts: EntityPlanSummary;
    vendors: EntityPlanSummary;
    staffCandidates: EntityPlanSummary;
    menuSuggestions: EntityPlanSummary;
    inspectionSuggestions: EntityPlanSummary;
  };
  relationshipPlan: Array<{
    fromDomain: string;
    toDomain: string;
    relationshipType: string;
    confidence: number;
    matchingKeys: string[];
    reasoning: string;
    expectedLinks: number | null;
    reviewRequired: boolean;
  }>;
  reviewGroups: Array<{
    severity: "low" | "medium" | "high" | "blocking";
    domain: string;
    issueType: string;
    affectedRowCount: number;
    sampleRows: number[];
    summary: string;
    recommendedAction: "accept" | "ignore" | "link_existing" | "edit_mapping" | "upload_better_file" | "manual_review";
  }>;
  activationReadiness: "not_ready" | "review_required" | "ready_for_dry_run" | "blocked";
  activationPreview: {
    creates: {
      customers: number;
      vehicles: number;
      historicalWorkOrders: number;
      historicalInvoices: number;
      parts: number;
      vendors: number;
      staffCandidates: number;
      menuSuggestions: number;
      inspectionSuggestions: number;
    };
    requiresReview: number;
    blockingIssues: number;
    risks: string[];
  };
};

export type OnboardingAgentInputPayload = {
  sessionId: string;
  shopId: string;
  files: Array<{
    fileId: string;
    filename: string;
    declaredDomain: string | null;
    detectedDomain: string;
    parseStatus: string | null;
    rowCount: number;
    headers: string[];
    sampleRows: Record<string, unknown>[];
    columnExamples: Record<string, unknown[]>;
    deterministic: {
      entityCount: number;
      linkCount: number;
      reviewCount: number;
    };
  }>;
  targetSchema: Record<string, string[]>;
};
