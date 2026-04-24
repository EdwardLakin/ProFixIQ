import type { Json } from "@shared/types/types/supabase";
import {
  type AiActionPreviewRecord,
  type AiActionPreviewStatus,
  type AiActorContext,
  type AiRiskTier,
  assertNonEmpty,
  ensureActorContext,
  fromTable,
  normalizeArrayJson,
  normalizeObjectJson,
  type AiServerClient,
  validateRiskTier,
} from "./types";
import {
  type AiOwnerPinProofReference,
  assertAiOwnerPinProofReference,
} from "./ownerPinProof";
import { logAiActionEvent } from "./actionEvents";
import { AI_ACTION_EVENT_TYPES, type AiActionEventType } from "./eventTypes";

type CreateAiActionPreviewInput = {
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
  requiresApproval?: boolean;
  requiresOwnerPin?: boolean;
  ownerPinProofRef?: AiOwnerPinProofReference;
  riskTier: AiRiskTier;
  evidenceSnapshotId?: string | null;
  expiresAt?: string | null;
  metadata?: Json;
};

function validatePreviewTransition(from: AiActionPreviewStatus, to: AiActionPreviewStatus) {
  const map: Record<AiActionPreviewStatus, ReadonlyArray<AiActionPreviewStatus>> = {
    draft: ["ready", "approval_required", "cancelled", "expired"],
    ready: ["approval_required", "approved", "rejected", "cancelled", "expired"],
    approval_required: ["approved", "rejected", "cancelled", "expired"],
    approved: ["cancelled", "expired", "executed", "failed"],
    rejected: [],
    expired: [],
    executed: [],
    cancelled: [],
    failed: [],
  };

  if (!map[from].includes(to)) {
    throw new Error(`invalid preview status transition ${from} -> ${to}`);
  }
}

function withOwnerPinProofRefInMetadata(input: {
  metadata?: Json;
  ownerPinProofRef?: AiOwnerPinProofReference;
  shopId: string;
  actorId: string;
  requiresOwnerPin: boolean;
}): Json {
  const metadata = normalizeObjectJson(input.metadata) as Record<string, Json>;

  if (!input.ownerPinProofRef) {
    return metadata;
  }

  const proofRef = assertAiOwnerPinProofReference(input.ownerPinProofRef, {
    expectedShopId: input.shopId,
    expectedActorId: input.actorId,
  });

  if (!input.requiresOwnerPin) {
    return metadata;
  }

  return {
    ...metadata,
    ownerPinProofRef: proofRef as unknown as Json,
  };
}

export async function createAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: CreateAiActionPreviewInput,
): Promise<AiActionPreviewRecord> {
  const ctx = ensureActorContext(actor);

  const requiresApproval = input.requiresApproval ?? true;
  const requiresOwnerPin = input.requiresOwnerPin ?? false;
  const normalizedIntendedMutations = normalizeArrayJson(input.intendedMutations);
  const normalizedSideEffects = normalizeArrayJson(input.sideEffects);

  if (!Array.isArray(normalizedIntendedMutations)) {
    throw new Error("intendedMutations must be an array");
  }
  if (!Array.isArray(normalizedSideEffects)) {
    throw new Error("sideEffects must be an array");
  }

  const insertPayload = {
    shop_id: ctx.shopId,
    recommendation_id: input.recommendationId ?? null,
    domain: assertNonEmpty(input.domain, "domain"),
    action_type: assertNonEmpty(input.actionType, "actionType"),
    subject_type: assertNonEmpty(input.subjectType, "subjectType"),
    subject_id: input.subjectId ?? null,
    status: requiresApproval ? "approval_required" : "draft",
    preview_payload: normalizeObjectJson(input.previewPayload),
    intended_mutations: normalizedIntendedMutations,
    affected_records: normalizeArrayJson(input.affectedRecords),
    side_effects: normalizedSideEffects,
    compensation_plan: normalizeObjectJson(input.compensationPlan),
    idempotency_key: input.idempotencyKey ?? null,
    requires_approval: requiresApproval,
    requires_owner_pin: requiresOwnerPin,
    risk_tier: validateRiskTier(input.riskTier),
    evidence_snapshot_id: input.evidenceSnapshotId ?? null,
    created_by: ctx.actorId,
    expires_at: input.expiresAt ?? null,
    metadata: withOwnerPinProofRefInMetadata({
      metadata: input.metadata,
      ownerPinProofRef: input.ownerPinProofRef,
      shopId: ctx.shopId,
      actorId: ctx.actorId,
      requiresOwnerPin,
    }),
  };

  const { data, error } = await fromTable(supabase, "ai_action_previews")
    .insert(insertPayload)
    .select("*")
    .single<AiActionPreviewRecord>();

  if (error) throw new Error(error.message);

  await logAiActionEvent(supabase, ctx, {
    recommendationId: data.recommendation_id,
    actionPreviewId: data.id,
    eventType: AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_CREATED,
    idempotencyKey: data.idempotency_key,
    payload: {
      action_preview_id: data.id,
      status: data.status,
      risk_tier: data.risk_tier,
      requires_approval: data.requires_approval,
    },
  });

  return data;
}

export async function getAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  previewId: string,
): Promise<AiActionPreviewRecord | null> {
  const ctx = ensureActorContext(actor);

  const { data, error } = await fromTable(supabase, "ai_action_previews")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("id", previewId)
    .maybeSingle<AiActionPreviewRecord>();

  if (error) throw new Error(error.message);
  return data;
}

async function updatePreviewStatus(
  supabase: AiServerClient,
  actor: AiActorContext,
  previewId: string,
  nextStatus: AiActionPreviewStatus,
  eventType: AiActionEventType,
  metadata?: Json,
): Promise<AiActionPreviewRecord> {
  const ctx = ensureActorContext(actor);
  const existing = await getAiActionPreview(supabase, ctx, previewId);

  if (!existing) throw new Error("action preview not found");
  validatePreviewTransition(existing.status, nextStatus);

  const { data, error } = await fromTable(supabase, "ai_action_previews")
    .update({ status: nextStatus, metadata: normalizeObjectJson(metadata ?? existing.metadata) })
    .eq("shop_id", ctx.shopId)
    .eq("id", previewId)
    .select("*")
    .single<AiActionPreviewRecord>();

  if (error) throw new Error(error.message);

  await logAiActionEvent(supabase, ctx, {
    recommendationId: data.recommendation_id,
    actionPreviewId: data.id,
    eventType,
    idempotencyKey: data.idempotency_key,
    payload: {
      action_preview_id: data.id,
      from_status: existing.status,
      to_status: data.status,
    },
  });

  return data;
}

export async function markAiActionPreviewReady(
  supabase: AiServerClient,
  actor: AiActorContext,
  previewId: string,
): Promise<AiActionPreviewRecord> {
  return updatePreviewStatus(supabase, actor, previewId, "ready", AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_READY);
}

export async function cancelAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  previewId: string,
  input?: { reason?: string | null },
): Promise<AiActionPreviewRecord> {
  return updatePreviewStatus(supabase, actor, previewId, "cancelled", AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_CANCELLED, {
    cancellation_reason: input?.reason ?? null,
  });
}
