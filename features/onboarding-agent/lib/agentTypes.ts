import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";

export type OnboardingAgentSeverity = "info" | "low" | "medium" | "high" | "blocking";

export type OnboardingAgentRecommendationActionType =
  | "accept_high_confidence"
  | "review_exception"
  | "upload_better_file"
  | "map_column"
  | "merge_duplicate"
  | "ignore_row"
  | "prepare_activation";

export type OnboardingAgentActivationStatus =
  | "not_ready"
  | "empty"
  | "review_required"
  | "ready_for_dry_run"
  | "ready_for_activation_later";

export type OnboardingAgentInput = {
  sessionId: string;
  shopId: string;
  files: Array<{
    id: string;
    filename: string;
    declaredDomain: string | null;
    detectedDomain: string | null;
    parseStatus: string | null;
    headers: string[];
    rowCount: number;
    sampleRows: Record<string, unknown>[];
  }>;
  deterministicDomainDetections: Record<string, number>;
  deterministicStagedEntityCounts: Record<string, number>;
  deterministicLinkCounts: Record<string, number>;
  deterministicReviewItems: Array<{
    id: string;
    severity: string;
    domain: string | null;
    summary: string;
    issueType: string;
    entityId: string | null;
    details: Record<string, unknown>;
  }>;
  activationPlanSummary: Record<string, unknown> | null;
};

export type OnboardingAgentFinding = {
  severity: OnboardingAgentSeverity;
  domain: OnboardingDomain | "all";
  title: string;
  explanation: string;
  evidence: string[];
  recommendedAction: string;
};

export type OnboardingAgentDomainSummary = {
  domain: OnboardingDomain;
  confidence: number;
  rowsSeen: number;
  entitiesDetected: number;
  readyCount: number;
  reviewCount: number;
  notes: string[];
};

export type OnboardingAgentRecommendation = {
  actionType: OnboardingAgentRecommendationActionType;
  domain: OnboardingDomain | "all";
  confidence: number;
  title: string;
  explanation: string;
  affectedEntityIds?: string[];
  affectedRowIds?: string[];
  riskLevel: "low" | "medium" | "high";
};

export type OnboardingAgentReport = {
  model: string;
  mode: "ai" | "deterministic_fallback";
  summary: string;
  domainSummaries: OnboardingAgentDomainSummary[];
  findings: OnboardingAgentFinding[];
  recommendations: OnboardingAgentRecommendation[];
  activationReadiness: {
    status: OnboardingAgentActivationStatus;
    blockers: string[];
    warnings: string[];
    safeToProceed: boolean;
  };
  generatedAt: string;
  liveRecordsCreated: 0;
};
