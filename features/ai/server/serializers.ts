import { normalizeArrayJson, normalizeObjectJson, type AiActionApprovalRecord, type AiActionPreviewRecord, type AiEvidenceSnapshotRecord, type AiRecommendationRecord } from "./types";
import { sanitizeDisplayText } from "./safeDisplay";

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeSideEffectLabels(value: unknown): string[] {
  const labels = normalizeStringArray(value);
  const unique = new Set<string>();

  for (const label of labels) {
    unique.add(label.toLowerCase());
  }

  return [...unique];
}

function getArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export type AiEvidenceSnapshotUiDto = {
  evidenceSnapshotId: string;
  evidenceKind: string;
  domain: string;
  subjectType: string;
  subjectId: string | null;
  generatedAt: string;
  freshnessAt: string | null;
  confidence: number | null;
  missingData: string[];
  missingDataCount: number;
};

export function serializeAiEvidenceSnapshotForUi(snapshot: AiEvidenceSnapshotRecord | null): AiEvidenceSnapshotUiDto | null {
  if (!snapshot) return null;
  const missingData = normalizeStringArray(snapshot.missing_data);

  return {
    evidenceSnapshotId: snapshot.id,
    evidenceKind: snapshot.evidence_kind,
    domain: snapshot.domain,
    subjectType: snapshot.subject_type,
    subjectId: snapshot.subject_id ?? null,
    generatedAt: snapshot.created_at,
    freshnessAt: snapshot.freshness_at ?? null,
    confidence: typeof snapshot.confidence === "number" ? snapshot.confidence : null,
    missingData,
    missingDataCount: missingData.length,
  };
}

export type AiRecommendationUiDto = {
  id: string;
  title: string;
  summary: string | null;
  priority: AiRecommendationRecord["priority"];
  confidence: number | null;
  risk_tier: AiRecommendationRecord["risk_tier"];
  status: AiRecommendationRecord["status"];
  recommendation_type: string;
  recommended_action: {
    label?: string;
    details?: string;
  } | null;
  missing_data: string[];
  created_at: string;
  evidence_snapshot_id: string | null;
  requires_approval: boolean;
  requires_owner_pin: boolean;
};

export function serializeAiRecommendationForUi(recommendation: AiRecommendationRecord): AiRecommendationUiDto {
  const recommendedAction = normalizeObjectJson(recommendation.recommended_action) as Record<string, unknown>;

  return {
    id: recommendation.id,
    title: sanitizeDisplayText(recommendation.title, "Recommendation"),
    summary: recommendation.summary ? sanitizeDisplayText(recommendation.summary, "") || null : null,
    priority: recommendation.priority,
    confidence: typeof recommendation.confidence === "number" ? recommendation.confidence : null,
    risk_tier: recommendation.risk_tier,
    status: recommendation.status,
    recommendation_type: recommendation.recommendation_type,
    recommended_action: {
      label: sanitizeDisplayText(recommendedAction.label, "") || undefined,
      details: sanitizeDisplayText(recommendedAction.details, "") || undefined,
    },
    missing_data: normalizeStringArray(recommendation.missing_data),
    created_at: recommendation.created_at,
    evidence_snapshot_id: recommendation.evidence_snapshot_id ?? null,
    requires_approval: recommendation.requires_approval,
    requires_owner_pin: recommendation.requires_owner_pin,
  };
}

export type AiActionPreviewUiDto = {
  previewId: string;
  recommendationId: string | null;
  actionType: string;
  status: string;
  title: string;
  description: string | null;
  approvalRequired: boolean;
  requiresOwnerPin: boolean;
  executionBlocked: true;
  riskTier: string;
  severitySummary: string;
  affectedRecordCount: number;
  intendedMutationCount: number;
  sideEffectLabels: string[];
  createdAt: string;
  expiresAt: string | null;
  evidenceSnapshotId: string | null;
  subjectType: string;
  subjectId: string | null;
};

export function serializeAiActionPreviewForUi(preview: AiActionPreviewRecord): AiActionPreviewUiDto {
  const previewPayload = normalizeObjectJson(preview.preview_payload) as Record<string, unknown>;
  const payloadLabels = normalizeSideEffectLabels(previewPayload.side_effects);
  const persistedLabels = normalizeSideEffectLabels(preview.side_effects);
  const sideEffectLabels = persistedLabels.length > 0 ? persistedLabels : payloadLabels;

  const title = sanitizeDisplayText(previewPayload.label, `Preview: ${preview.action_type}`);

  const description = sanitizeDisplayText(previewPayload.description, "") || null;

  return {
    previewId: preview.id,
    recommendationId: preview.recommendation_id ?? null,
    actionType: preview.action_type,
    status: preview.status,
    title,
    description,
    approvalRequired: preview.requires_approval,
    requiresOwnerPin: preview.requires_owner_pin,
    executionBlocked: true,
    riskTier: preview.risk_tier,
    severitySummary: `severity:${preview.risk_tier}`,
    affectedRecordCount: getArrayLength(normalizeArrayJson(preview.affected_records)),
    intendedMutationCount: getArrayLength(normalizeArrayJson(preview.intended_mutations)),
    sideEffectLabels,
    createdAt: preview.created_at,
    expiresAt: preview.expires_at ?? null,
    evidenceSnapshotId: preview.evidence_snapshot_id ?? null,
    subjectType: preview.subject_type,
    subjectId: preview.subject_id ?? null,
  };
}

export type AiApprovalRequestUiDto = {
  approvalId: string;
  previewId: string;
  status: string;
  requestedAt: string;
  approvalRequired: boolean;
  requiresOwnerPin: boolean;
  executionBlocked: true;
  message: string;
};

export function serializeAiApprovalRequestForUi(input: {
  approval: AiActionApprovalRecord;
  preview: AiActionPreviewRecord;
}): AiApprovalRequestUiDto {
  return {
    approvalId: input.approval.id,
    previewId: input.preview.id,
    status: input.approval.status,
    requestedAt: input.approval.requested_at,
    approvalRequired: true,
    requiresOwnerPin: Boolean(input.preview.requires_owner_pin),
    executionBlocked: true,
    message: "Approval request recorded for review only. Action execution remains blocked.",
  };
}
