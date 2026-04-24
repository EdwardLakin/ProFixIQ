import type { Json } from "@shared/types/types/supabase";
import {
  type AiActionApprovalRecord,
  type AiActionPreviewStatus,
  type AiActionApprovalStatus,
  type AiActionPreviewRecord,
  type AiActorContext,
  ensureActorContext,
  fromTable,
  normalizeObjectJson,
  type AiServerClient,
} from "./types";
import { getAiActionPreview } from "./actionPreviews";
import { logAiActionEvent } from "./actionEvents";
import { AI_ACTION_EVENT_TYPES } from "./eventTypes";
import {
  type AiOwnerPinProofReference,
  assertAiOwnerPinProofReference,
} from "./ownerPinProof";

function validateApprovalTransition(from: AiActionApprovalStatus, to: AiActionApprovalStatus) {
  const map: Record<AiActionApprovalStatus, ReadonlyArray<AiActionApprovalStatus>> = {
    pending: ["approved", "rejected", "expired", "cancelled"],
    approved: [],
    rejected: [],
    expired: [],
    cancelled: [],
  };

  if (!map[from].includes(to)) {
    throw new Error(`invalid approval status transition ${from} -> ${to}`);
  }
}

async function setPreviewStatus(
  supabase: AiServerClient,
  preview: AiActionPreviewRecord,
  status: string,
): Promise<void> {
  const { error } = await fromTable(supabase, "ai_action_previews")
    .update({ status })
    .eq("shop_id", preview.shop_id)
    .eq("id", preview.id);

  if (error) throw new Error(error.message);
}

function withOwnerPinProofRefInMetadata(input: {
  metadata?: Json;
  ownerPinProofRef?: AiOwnerPinProofReference;
  shopId: string;
  actorId: string;
  ownerPinRequired: boolean;
}): Json {
  const metadata = normalizeObjectJson(input.metadata) as Record<string, Json>;

  if (!input.ownerPinProofRef) {
    return metadata;
  }

  const proofRef = assertAiOwnerPinProofReference(input.ownerPinProofRef, {
    expectedShopId: input.shopId,
    expectedActorId: input.actorId,
  });

  if (!input.ownerPinRequired) {
    return metadata;
  }

  return {
    ...metadata,
    ownerPinProofRef: proofRef as unknown as Json,
  };
}

const APPROVAL_REQUEST_ELIGIBLE_PREVIEW_STATUSES: ReadonlySet<AiActionPreviewStatus> = new Set([
  "ready",
  "approval_required",
]);

const APPROVAL_REQUEST_TERMINAL_PREVIEW_STATUSES: ReadonlySet<AiActionPreviewStatus> = new Set([
  "approved",
  "rejected",
  "expired",
  "executed",
  "cancelled",
  "failed",
]);

function parseApprovalHintFromPreview(preview: AiActionPreviewRecord): { requiresApproval: boolean } {
  if (preview.requires_approval) {
    return { requiresApproval: true };
  }

  if (preview.risk_tier === "high" || preview.risk_tier === "critical") {
    return { requiresApproval: true };
  }

  const previewPayload = normalizeObjectJson(preview.preview_payload) as Record<string, Json>;
  if (previewPayload.requires_approval === true) {
    return { requiresApproval: true };
  }

  const metadata = normalizeObjectJson(preview.metadata) as Record<string, Json>;
  if (metadata.approval_required === true || metadata.requires_approval === true) {
    return { requiresApproval: true };
  }

  return { requiresApproval: false };
}

export type RequestAiActionPreviewApprovalResult = {
  approval: AiActionApprovalRecord;
  preview: AiActionPreviewRecord;
  created: boolean;
  executionBlocked: true;
  warnings: string[];
};

export async function requestAiActionPreviewApproval(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    previewId: string;
    ownerPinProofRef?: AiOwnerPinProofReference;
    reason?: string | null;
    expiresAt?: string | null;
  },
): Promise<RequestAiActionPreviewApprovalResult> {
  const ctx = ensureActorContext(actor);
  const preview = await getAiActionPreview(supabase, ctx, input.previewId);
  if (!preview) throw new Error("action preview not found");

  if (APPROVAL_REQUEST_TERMINAL_PREVIEW_STATUSES.has(preview.status)) {
    throw new Error("action preview is in a terminal state");
  }
  if (!APPROVAL_REQUEST_ELIGIBLE_PREVIEW_STATUSES.has(preview.status)) {
    throw new Error(`action preview status ${preview.status} cannot request approval`);
  }

  const approvalHint = parseApprovalHintFromPreview(preview);
  if (!approvalHint.requiresApproval) {
    throw new Error("action preview does not require approval");
  }

  let ownerPinProofRef: AiOwnerPinProofReference | null = null;
  if (input.ownerPinProofRef) {
    try {
      ownerPinProofRef = assertAiOwnerPinProofReference(input.ownerPinProofRef, {
        expectedShopId: ctx.shopId,
        expectedActorId: ctx.actorId,
      });
    } catch {
      await logAiActionEvent(supabase, ctx, {
        recommendationId: preview.recommendation_id,
        actionPreviewId: preview.id,
        eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_INVALID,
        payload: {
          action_preview_id: preview.id,
          approval_request_only: true,
        },
      });
      throw new Error("invalid owner PIN proof reference");
    }
  }

  if (preview.requires_owner_pin && !ownerPinProofRef) {
    await logAiActionEvent(supabase, ctx, {
      recommendationId: preview.recommendation_id,
      actionPreviewId: preview.id,
      eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_MISSING,
      payload: {
        action_preview_id: preview.id,
        approval_request_only: true,
      },
    });
    throw new Error("owner PIN proof is required before requesting approval");
  }

  const { data: existingPending, error: existingPendingError } = await fromTable(supabase, "ai_action_approvals")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("action_preview_id", preview.id)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle<AiActionApprovalRecord>();

  if (existingPendingError) throw new Error(existingPendingError.message);
  if (existingPending) {
    return {
      approval: existingPending,
      preview,
      created: false,
      executionBlocked: true,
      warnings: [],
    };
  }

  const now = new Date().toISOString();
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    throw new Error("invalid expiresAt");
  }

  const metadata = withOwnerPinProofRefInMetadata({
    metadata: {
      requestedByActorId: ctx.actorId,
      requestedAt: now,
      reason: input.reason ?? null,
      approvalRequestOnly: true,
      executionBlocked: true,
    },
    ownerPinProofRef: ownerPinProofRef ?? undefined,
    shopId: ctx.shopId,
    actorId: ctx.actorId,
    ownerPinRequired: preview.requires_owner_pin,
  });

  const { data: approval, error: insertError } = await fromTable(supabase, "ai_action_approvals")
    .insert({
      shop_id: ctx.shopId,
      action_preview_id: preview.id,
      status: "pending",
      requested_by: ctx.actorId,
      owner_pin_required: preview.requires_owner_pin,
      owner_pin_verified: false,
      owner_pin_verification_ref: ownerPinProofRef?.verificationRef ?? null,
      expires_at: expiresAt,
      metadata,
    })
    .select("*")
    .single<AiActionApprovalRecord>();

  if (insertError) throw new Error(insertError.message);

  if (ownerPinProofRef) {
    await logAiActionEvent(supabase, ctx, {
      recommendationId: preview.recommendation_id,
      actionPreviewId: preview.id,
      approvalId: approval.id,
      eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_ATTACHED,
      payload: {
        action_preview_id: preview.id,
        approval_id: approval.id,
        proof_purpose: ownerPinProofRef.purpose,
      },
    });
  }

  await logAiActionEvent(supabase, ctx, {
    recommendationId: preview.recommendation_id,
    actionPreviewId: preview.id,
    approvalId: approval.id,
    eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REQUESTED,
    payload: {
      action_preview_id: preview.id,
      approval_id: approval.id,
      approval_request_only: true,
      execution_blocked: true,
      owner_pin_required: preview.requires_owner_pin,
      reason: input.reason ?? null,
    },
  });

  return {
    approval,
    preview,
    created: true,
    executionBlocked: true,
    warnings: [],
  };
}

export async function requestAiActionApproval(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    actionPreviewId: string;
    ownerPinRequired?: boolean;
    ownerPinProofRef?: AiOwnerPinProofReference;
    expiresAt?: string | null;
    metadata?: Json;
  },
): Promise<AiActionApprovalRecord> {
  const ctx = ensureActorContext(actor);
  const preview = await getAiActionPreview(supabase, ctx, input.actionPreviewId);
  if (!preview) throw new Error("action preview not found");

  const ownerPinRequired = input.ownerPinRequired ?? preview.requires_owner_pin;
  const ownerPinProofRef = input.ownerPinProofRef
    ? assertAiOwnerPinProofReference(input.ownerPinProofRef, {
        expectedShopId: ctx.shopId,
        expectedActorId: ctx.actorId,
      })
    : null;

  const insertPayload = {
    shop_id: ctx.shopId,
    action_preview_id: preview.id,
    status: "pending",
    requested_by: ctx.actorId,
    owner_pin_required: ownerPinRequired,
    owner_pin_verified: false,
    owner_pin_verification_ref: ownerPinProofRef?.verificationRef ?? null,
    expires_at: input.expiresAt ?? null,
    metadata: withOwnerPinProofRefInMetadata({
      metadata: input.metadata,
      ownerPinProofRef: ownerPinProofRef ?? undefined,
      shopId: ctx.shopId,
      actorId: ctx.actorId,
      ownerPinRequired,
    }),
  };

  const { data, error } = await fromTable(supabase, "ai_action_approvals")
    .insert(insertPayload)
    .select("*")
    .single<AiActionApprovalRecord>();

  if (error) throw new Error(error.message);

  if (preview.status !== "approval_required") {
    await setPreviewStatus(supabase, preview, "approval_required");
  }

  if (ownerPinProofRef && ownerPinRequired) {
    await logAiActionEvent(supabase, ctx, {
      recommendationId: preview.recommendation_id,
      actionPreviewId: preview.id,
      approvalId: data.id,
      eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_ATTACHED,
      payload: {
        action_preview_id: preview.id,
        approval_id: data.id,
      },
    });
  }

  await logAiActionEvent(supabase, ctx, {
    recommendationId: preview.recommendation_id,
    actionPreviewId: preview.id,
    approvalId: data.id,
    eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REQUESTED,
    payload: {
      action_preview_id: preview.id,
      approval_id: data.id,
      owner_pin_required: data.owner_pin_required,
    },
  });

  return data;
}

async function decideAiActionApproval(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    approvalId: string;
    status: "approved" | "rejected";
    decisionNote?: string | null;
    ownerPinVerified?: boolean;
    ownerPinVerificationRef?: string | null;
    ownerPinProofRef?: AiOwnerPinProofReference;
  },
): Promise<AiActionApprovalRecord> {
  const ctx = ensureActorContext(actor);

  const { data: existing, error: lookupError } = await fromTable(supabase, "ai_action_approvals")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("id", input.approvalId)
    .maybeSingle<AiActionApprovalRecord>();

  if (lookupError) throw new Error(lookupError.message);
  if (!existing) throw new Error("approval not found");

  validateApprovalTransition(existing.status, input.status);

  const ownerPinProofRef = input.ownerPinProofRef
    ? assertAiOwnerPinProofReference(input.ownerPinProofRef, {
        expectedShopId: ctx.shopId,
        expectedActorId: ctx.actorId,
      })
    : null;

  const requiresProofForApproval = existing.owner_pin_required && input.status === "approved";
  if (requiresProofForApproval && !ownerPinProofRef && (!input.ownerPinVerified || !input.ownerPinVerificationRef)) {
    const preview = await getAiActionPreview(supabase, ctx, existing.action_preview_id);
    await logAiActionEvent(supabase, ctx, {
      recommendationId: preview?.recommendation_id ?? null,
      actionPreviewId: existing.action_preview_id,
      approvalId: existing.id,
      eventType: AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_MISSING,
      payload: {
        action_preview_id: existing.action_preview_id,
        approval_id: existing.id,
      },
    });
    throw new Error("owner PIN verification is required to approve this action preview");
  }

  const now = new Date().toISOString();

  const mergedMetadata = withOwnerPinProofRefInMetadata({
    metadata: existing.metadata,
    ownerPinProofRef: ownerPinProofRef ?? undefined,
    shopId: ctx.shopId,
    actorId: ctx.actorId,
    ownerPinRequired: existing.owner_pin_required,
  });

  const { data, error } = await fromTable(supabase, "ai_action_approvals")
    .update({
      status: input.status,
      decided_by: ctx.actorId,
      decided_at: now,
      decision_note: input.decisionNote ?? null,
      owner_pin_verified: input.ownerPinVerified ?? Boolean(ownerPinProofRef),
      owner_pin_verification_ref: input.ownerPinVerificationRef ?? ownerPinProofRef?.verificationRef ?? null,
      metadata: mergedMetadata,
    })
    .eq("shop_id", ctx.shopId)
    .eq("id", input.approvalId)
    .select("*")
    .single<AiActionApprovalRecord>();

  if (error) throw new Error(error.message);

  const preview = await getAiActionPreview(supabase, ctx, data.action_preview_id);
  if (!preview) throw new Error("linked action preview not found");

  await setPreviewStatus(supabase, preview, input.status === "approved" ? "approved" : "rejected");

  await logAiActionEvent(supabase, ctx, {
    recommendationId: preview.recommendation_id,
    actionPreviewId: preview.id,
    approvalId: data.id,
    eventType:
      input.status === "approved"
        ? AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_APPROVED
        : AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REJECTED,
    payload: {
      action_preview_id: preview.id,
      approval_id: data.id,
      decision_note: input.decisionNote ?? null,
      owner_pin_verified: data.owner_pin_verified,
      owner_pin_verification_ref: data.owner_pin_verification_ref,
    },
  });

  return data;
}

export async function approveAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    approvalId: string;
    decisionNote?: string | null;
    ownerPinVerified?: boolean;
    ownerPinVerificationRef?: string | null;
    ownerPinProofRef?: AiOwnerPinProofReference;
  },
): Promise<AiActionApprovalRecord> {
  return decideAiActionApproval(supabase, actor, {
    approvalId: input.approvalId,
    status: "approved",
    decisionNote: input.decisionNote,
    ownerPinVerified: input.ownerPinVerified,
    ownerPinVerificationRef: input.ownerPinVerificationRef,
    ownerPinProofRef: input.ownerPinProofRef,
  });
}

export async function rejectAiActionPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    approvalId: string;
    decisionNote?: string | null;
  },
): Promise<AiActionApprovalRecord> {
  return decideAiActionApproval(supabase, actor, {
    approvalId: input.approvalId,
    status: "rejected",
    decisionNote: input.decisionNote,
  });
}
