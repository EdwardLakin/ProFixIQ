import type { Json } from "@shared/types/types/supabase";
import type { AiRecommendationRecord, AiRiskTier } from "@/features/ai/server/types";

export type WorkOrderPreviewActionType =
  | "review_work_order"
  | "check_parts_status"
  | "complete_inspection_review"
  | "review_closeout_readiness"
  | "advisor_review_needed"
  | "priority_escalation_review";

export type WorkOrderRecommendationPreviewability =
  | { previewable: true; actionType: WorkOrderPreviewActionType }
  | { previewable: false; reason: string };

export type WorkOrderActionPreviewPayload = {
  previewable: true;
  action_type: WorkOrderPreviewActionType;
  label: string;
  description: string;
  recommendation_id: string;
  work_order_id: string;
  evidence_snapshot_id: string | null;
  intended_mutations: [];
  affected_records: Array<{
    type: "work_order" | "recommendation" | "evidence_snapshot";
    id: string;
  }>;
  side_effects: string[];
  compensation_plan: {
    mode: "preview_only";
    details: string;
  };
  requires_approval: boolean;
  requires_owner_pin: false;
  risk_tier: AiRiskTier;
  blocked_execution_reason: string;
  evidence_used: {
    evidence_snapshot_id: string | null;
    recommendation_id: string;
    recommendation_type: string;
  };
};

type ActionSpec = {
  actionType: WorkOrderPreviewActionType;
  label: string;
  description: string;
};

const PREVIEW_BLOCKED_REASON = "Autonomous AI action execution is not enabled. This preview is informational only.";

const RECOMMENDATION_PREVIEW_MAP: Record<string, ActionSpec> = {
  work_order_aging_without_next_action: {
    actionType: "review_work_order",
    label: "Review work order",
    description: "Review assignment, hold reasons, and next operational step for this work order.",
  },
  waiting_on_approval: {
    actionType: "advisor_review_needed",
    label: "Advisor review needed",
    description: "Review pending approval state using the existing advisor workflow.",
  },
  waiting_on_parts: {
    actionType: "check_parts_status",
    label: "Check parts status",
    description: "Review open parts requests, receiving status, and part-related holds.",
  },
  inspection_incomplete: {
    actionType: "complete_inspection_review",
    label: "Complete inspection review",
    description: "Review inspection completeness and finalize through the existing inspection flow.",
  },
  ready_for_closeout_review: {
    actionType: "review_closeout_readiness",
    label: "Review closeout readiness",
    description: "Review closeout/invoice readiness with no automatic closeout mutation.",
  },
  technician_blocked_or_stale_active_work: {
    actionType: "review_work_order",
    label: "Review work order",
    description: "Review active technician dispatch and stale activity signals.",
  },
  priority_escalation_candidate: {
    actionType: "priority_escalation_review",
    label: "Priority escalation review",
    description: "Escalate this work order for internal manager/advisor review only.",
  },
};

function isAllowedRiskTier(riskTier: AiRiskTier): boolean {
  return riskTier === "low" || riskTier === "medium" || riskTier === "high";
}

export function isWorkOrderRecommendationPreviewable(
  recommendation: Pick<AiRecommendationRecord, "recommendation_type" | "risk_tier">,
): WorkOrderRecommendationPreviewability {
  const mapped = RECOMMENDATION_PREVIEW_MAP[recommendation.recommendation_type];

  if (!mapped) {
    return { previewable: false, reason: "Recommendation action is not in the low-risk internal preview allowlist." };
  }

  if (!isAllowedRiskTier(recommendation.risk_tier)) {
    return { previewable: false, reason: "Critical-risk recommendations are not previewable in this phase." };
  }

  return { previewable: true, actionType: mapped.actionType };
}

export function buildWorkOrderActionPreviewPayload(input: {
  recommendation: Pick<
    AiRecommendationRecord,
    "id" | "recommendation_type" | "risk_tier" | "evidence_snapshot_id" | "summary" | "subject_id" | "title"
  >;
  workOrderId: string;
}): WorkOrderActionPreviewPayload | { previewable: false; reason: string } {
  const previewability = isWorkOrderRecommendationPreviewable(input.recommendation);
  if (!previewability.previewable) {
    return previewability;
  }

  const spec = RECOMMENDATION_PREVIEW_MAP[input.recommendation.recommendation_type];
  const requiresApproval = input.recommendation.risk_tier === "medium" || input.recommendation.risk_tier === "high";

  const affectedRecords: WorkOrderActionPreviewPayload["affected_records"] = [
    { type: "work_order", id: input.workOrderId },
    { type: "recommendation", id: input.recommendation.id },
  ];

  if (input.recommendation.evidence_snapshot_id) {
    affectedRecords.push({ type: "evidence_snapshot", id: input.recommendation.evidence_snapshot_id });
  }

  return {
    previewable: true,
    action_type: spec.actionType,
    label: spec.label,
    description: input.recommendation.summary?.trim() || spec.description,
    recommendation_id: input.recommendation.id,
    work_order_id: input.workOrderId,
    evidence_snapshot_id: input.recommendation.evidence_snapshot_id,
    intended_mutations: [],
    affected_records: affectedRecords,
    side_effects: ["Internal operational preview only.", "No external/customer-facing side effects."],
    compensation_plan: {
      mode: "preview_only",
      details: "No execution is supported yet; no compensation plan is needed for preview-only generation.",
    },
    requires_approval: requiresApproval,
    requires_owner_pin: false,
    risk_tier: input.recommendation.risk_tier,
    blocked_execution_reason: PREVIEW_BLOCKED_REASON,
    evidence_used: {
      evidence_snapshot_id: input.recommendation.evidence_snapshot_id,
      recommendation_id: input.recommendation.id,
      recommendation_type: input.recommendation.recommendation_type,
    },
  };
}

export function buildWorkOrderPreviewIdempotencyKey(input: {
  shopId: string;
  workOrderId: string;
  recommendationId: string;
  actionType: WorkOrderPreviewActionType;
}): string {
  return [input.shopId, input.workOrderId, input.recommendationId, input.actionType].join(":");
}

export function normalizePreviewWarnings(preview: WorkOrderActionPreviewPayload): string[] {
  const warnings: string[] = [preview.blocked_execution_reason];
  if (preview.requires_approval) {
    warnings.push("Approval would be required before any future execution phase.");
  }
  return warnings;
}

export function asJsonRecord(value: Record<string, unknown>): Json {
  return value as Json;
}
