import type { Json } from "@shared/types/types/supabase";
import type { AiActionPreviewRecord, AiActorContext, AiRiskTier } from "./types";
import type { AiOwnerPinProofReference } from "./ownerPinProof";
import { createAiActionPreview, getAiActionPreview } from "./actionPreviews";
import type { AiServerClient } from "./types";

export type SafeActionExecutionGuard = {
  allowed: false;
  reason: string;
  requirements: {
    tenantShopIdRequired: true;
    actorContextRequired: true;
    previewRequired: true;
    evidenceRequired: true;
    idempotencyKeyRequired: true;
    compensationPlanRequired: true;
    approvalRequiredForRisk: ReadonlyArray<AiRiskTier>;
    ownerPinRequiredForHighRisk: true;
  };
};

export async function buildAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    recommendationId?: string | null;
    domain: string;
    actionType: string;
    subjectType: string;
    subjectId?: string | null;
    previewPayload?: Json;
    intendedMutations?: Json;
    affectedRecords?: Json;
    sideEffects?: Json;
    compensationPlan?: Json;
    idempotencyKey?: string | null;
    riskTier: AiRiskTier;
    evidenceSnapshotId?: string | null;
    requiresOwnerPin?: boolean;
    metadata?: Json;
    ownerPinProofRef?: AiOwnerPinProofReference;
  },
): Promise<AiActionPreviewRecord> {
  return createAiActionPreview(supabase, actor, {
    recommendationId: input.recommendationId,
    domain: input.domain,
    actionType: input.actionType,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    previewPayload: input.previewPayload,
    intendedMutations: input.intendedMutations,
    affectedRecords: input.affectedRecords,
    sideEffects: input.sideEffects,
    compensationPlan: input.compensationPlan,
    idempotencyKey: input.idempotencyKey,
    riskTier: input.riskTier,
    evidenceSnapshotId: input.evidenceSnapshotId,
    requiresApproval: true,
    requiresOwnerPin: input.requiresOwnerPin ?? (input.riskTier === "high" || input.riskTier === "critical"),
    metadata: input.metadata,
    ownerPinProofRef: input.ownerPinProofRef,
  });
}

export function requireAiActionApproval(input: {
  riskTier: AiRiskTier;
  requiresApproval: boolean;
}): { required: boolean; reason: string } {
  if (!input.requiresApproval) {
    return { required: false, reason: "approval explicitly disabled for this preview" };
  }

  if (input.riskTier === "medium" || input.riskTier === "high" || input.riskTier === "critical") {
    return { required: true, reason: `approval required for ${input.riskTier} risk action preview` };
  }

  return { required: true, reason: "approval required by safe-action substrate default" };
}

export async function assertAiActionCanExecute(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: { actionPreviewId: string; ownerPinProofRef?: AiOwnerPinProofReference },
): Promise<SafeActionExecutionGuard> {
  await getAiActionPreview(supabase, actor, input.actionPreviewId);

  return {
    allowed: false,
    reason:
      "Autonomous AI action execution is not enabled. This substrate supports preview and approval only.",
    requirements: {
      tenantShopIdRequired: true,
      actorContextRequired: true,
      previewRequired: true,
      evidenceRequired: true,
      idempotencyKeyRequired: true,
      compensationPlanRequired: true,
      approvalRequiredForRisk: ["medium", "high", "critical"],
      ownerPinRequiredForHighRisk: true,
    },
  };
}
