import type { OnboardingDomain } from "@/features/onboarding-agent/lib/domains";

export type OnboardingStageDecision = "staged" | "review" | "skipped";

export type OnboardingFilePipelineTrace = {
  sessionId: string;
  fileId: string;
  fileName: string;
  declaredDomain: string | null;
  detectedDomain: OnboardingDomain;
  finalDomainUsed: OnboardingDomain;
  rowCountTotal: number;
  rowsSampledForAI: number;
  effectiveHeaderMapSource: "ai" | "deterministic_alias" | "mixed" | "none";
  effectiveHeaderMapCount: number;
  effectiveHeaderMapKeys: string[];
  sourceHeaderKeysSample: string[];
  canonicalFieldsMapped: string[];
  firstRepresentativeRowTrace: {
    rawKeyCount: number;
    remappedKeyCount: number;
    normalizedKeyCount: number;
    identityKeysPresent: string[];
    identityKeysMissing: string[];
    stageDecision: OnboardingStageDecision;
    stageReason: string;
  } | null;
  persistedEntityCount: number;
  readyCount: number;
  reviewCount: number;
  persistedLinkCountsByType: Record<string, number>;
  reviewIssueCountsByCode: Record<string, number>;
};
