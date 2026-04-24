import type { Json } from "@shared/types/types/supabase";
import {
  type AiActionApprovalRecord,
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

export async function requestAiActionApproval(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    actionPreviewId: string;
    ownerPinRequired?: boolean;
    expiresAt?: string | null;
    metadata?: Json;
  },
): Promise<AiActionApprovalRecord> {
  const ctx = ensureActorContext(actor);
  const preview = await getAiActionPreview(supabase, ctx, input.actionPreviewId);
  if (!preview) throw new Error("action preview not found");

  const insertPayload = {
    shop_id: ctx.shopId,
    action_preview_id: preview.id,
    status: "pending",
    requested_by: ctx.actorId,
    owner_pin_required: input.ownerPinRequired ?? preview.requires_owner_pin,
    owner_pin_verified: false,
    owner_pin_verification_ref: null,
    expires_at: input.expiresAt ?? null,
    metadata: normalizeObjectJson(input.metadata),
  };

  const { data, error } = await fromTable(supabase, "ai_action_approvals")
    .insert(insertPayload)
    .select("*")
    .single<AiActionApprovalRecord>();

  if (error) throw new Error(error.message);

  if (preview.status !== "approval_required") {
    await setPreviewStatus(supabase, preview, "approval_required");
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

  if (existing.owner_pin_required && input.status === "approved") {
    if (!input.ownerPinVerified || !input.ownerPinVerificationRef) {
      throw new Error("owner PIN verification is required to approve this action preview");
    }
  }

  const now = new Date().toISOString();

  const { data, error } = await fromTable(supabase, "ai_action_approvals")
    .update({
      status: input.status,
      decided_by: ctx.actorId,
      decided_at: now,
      decision_note: input.decisionNote ?? null,
      owner_pin_verified: input.ownerPinVerified ?? false,
      owner_pin_verification_ref: input.ownerPinVerificationRef ?? null,
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
  },
): Promise<AiActionApprovalRecord> {
  return decideAiActionApproval(supabase, actor, {
    approvalId: input.approvalId,
    status: "approved",
    decisionNote: input.decisionNote,
    ownerPinVerified: input.ownerPinVerified,
    ownerPinVerificationRef: input.ownerPinVerificationRef,
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
