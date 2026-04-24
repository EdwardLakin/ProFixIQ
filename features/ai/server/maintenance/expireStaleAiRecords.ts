import { logAiActionEvent } from "../actionEvents";
import { AI_ACTION_EVENT_TYPES } from "../eventTypes";
import {
  ensureActorContext,
  fromTable,
  type AiActorContext,
  type AiActionApprovalStatus,
  type AiActionPreviewStatus,
  type AiRecommendationStatus,
} from "../types";
import type { ExpirationCounts, ExpireStaleAiRecordsInput, ExpireStaleAiRecordsResult } from "./types";

type RecommendationCandidateRow = {
  id: string;
  shop_id: string;
  status: AiRecommendationStatus;
  expires_at: string | null;
};

type ActionPreviewCandidateRow = {
  id: string;
  shop_id: string;
  recommendation_id: string | null;
  idempotency_key: string | null;
  status: AiActionPreviewStatus;
  expires_at: string | null;
};

type ActionApprovalCandidateRow = {
  id: string;
  shop_id: string;
  action_preview_id: string;
  status: AiActionApprovalStatus;
  expires_at: string | null;
};

type PreviewReferenceRow = {
  id: string;
  recommendation_id: string | null;
  idempotency_key: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SYSTEM_ACTOR_ID = "ai-maintenance-expirer";
const EXPIRY_REASON = "expires_at_elapsed";

function toIsoString(now?: Date): string {
  if (!now) return new Date().toISOString();
  if (Number.isNaN(now.getTime())) {
    throw new Error("Invalid now value supplied to expireStaleAiRecords");
  }
  return now.toISOString();
}

function sanitizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit as number), MAX_LIMIT));
}

function buildDefaultActor(shopId: string): AiActorContext {
  return {
    shopId,
    actorId: SYSTEM_ACTOR_ID,
    role: "system",
    source: "system",
  };
}

function buildScopedActor(input: {
  shopId: string;
  actorContext?: AiActorContext;
}): AiActorContext {
  const actor = input.actorContext
    ? { ...input.actorContext, shopId: input.shopId }
    : buildDefaultActor(input.shopId);

  return ensureActorContext(actor);
}

export async function expireStaleAiRecords(input: ExpireStaleAiRecordsInput): Promise<ExpireStaleAiRecordsResult> {
  const dryRun = input.dryRun ?? false;
  const nowIso = toIsoString(input.now);
  const limit = sanitizeLimit(input.limit);
  const warnings: string[] = [];

  let recommendationQuery = fromTable(input.supabase, "ai_recommendations")
    .select("id, shop_id, status, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso)
    .in("status", ["open", "acknowledged"])
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (input.shopId) {
    recommendationQuery = recommendationQuery.eq("shop_id", input.shopId);
  }

  const { data: recommendationCandidatesData, error: recommendationCandidatesError } =
    await recommendationQuery;

  if (recommendationCandidatesError) {
    throw new Error(`Failed to load stale recommendations: ${recommendationCandidatesError.message}`);
  }

  const recommendationCandidates = (recommendationCandidatesData ?? []) as RecommendationCandidateRow[];

  let previewQuery = fromTable(input.supabase, "ai_action_previews")
    .select("id, shop_id, recommendation_id, idempotency_key, status, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso)
    .in("status", ["draft", "ready", "approval_required"])
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (input.shopId) {
    previewQuery = previewQuery.eq("shop_id", input.shopId);
  }

  const { data: previewCandidatesData, error: previewCandidatesError } = await previewQuery;

  if (previewCandidatesError) {
    throw new Error(`Failed to load stale action previews: ${previewCandidatesError.message}`);
  }

  const previewCandidates = (previewCandidatesData ?? []) as ActionPreviewCandidateRow[];

  let approvalQuery = fromTable(input.supabase, "ai_action_approvals")
    .select("id, shop_id, action_preview_id, status, expires_at")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso)
    .eq("status", "pending")
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (input.shopId) {
    approvalQuery = approvalQuery.eq("shop_id", input.shopId);
  }

  const { data: approvalCandidatesData, error: approvalCandidatesError } = await approvalQuery;

  if (approvalCandidatesError) {
    throw new Error(`Failed to load stale action approvals: ${approvalCandidatesError.message}`);
  }

  const approvalCandidates = (approvalCandidatesData ?? []) as ActionApprovalCandidateRow[];

  const recommendations = {
    candidates: recommendationCandidates.length,
    expired: 0,
    candidateIds: recommendationCandidates.map((row) => row.id),
  } satisfies ExpirationCounts;

  const previews = {
    candidates: previewCandidates.length,
    expired: 0,
    candidateIds: previewCandidates.map((row) => row.id),
  } satisfies ExpirationCounts;

  const approvals = {
    candidates: approvalCandidates.length,
    expired: 0,
    candidateIds: approvalCandidates.map((row) => row.id),
  } satisfies ExpirationCounts;

  if (!dryRun) {
    const approvalPreviewIds = Array.from(new Set(approvalCandidates.map((row) => row.action_preview_id)));
    const previewReferenceById = new Map<string, PreviewReferenceRow>();

    if (approvalPreviewIds.length > 0) {
      let previewReferenceQuery = fromTable(input.supabase, "ai_action_previews")
        .select("id, recommendation_id, idempotency_key")
        .in("id", approvalPreviewIds)
        .limit(Math.min(approvalPreviewIds.length, MAX_LIMIT));

      if (input.shopId) {
        previewReferenceQuery = previewReferenceQuery.eq("shop_id", input.shopId);
      }

      const { data: previewReferenceData, error: previewReferenceError } = await previewReferenceQuery;

      if (previewReferenceError) {
        warnings.push(`Failed to load preview references for approvals: ${previewReferenceError.message}`);
      } else {
        for (const row of (previewReferenceData ?? []) as PreviewReferenceRow[]) {
          previewReferenceById.set(row.id, row);
        }
      }
    }

    for (const row of recommendationCandidates) {
      const { data: updated, error } = await fromTable(input.supabase, "ai_recommendations")
        .update({ status: "expired" })
        .eq("shop_id", row.shop_id)
        .eq("id", row.id)
        .eq("status", row.status)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (error) {
        warnings.push(`Failed to expire recommendation ${row.id}: ${error.message}`);
        continue;
      }

      if (!updated) continue;

      const actor = buildScopedActor({ shopId: row.shop_id, actorContext: input.actorContext });
      await logAiActionEvent(input.supabase, actor, {
        recommendationId: row.id,
        eventType: AI_ACTION_EVENT_TYPES.RECOMMENDATION_EXPIRED,
        payload: {
          recommendation_id: row.id,
          previous_status: row.status,
          expires_at: row.expires_at,
          expired_at: nowIso,
          reason: EXPIRY_REASON,
        },
      });

      recommendations.expired += 1;
    }

    for (const row of previewCandidates) {
      const { data: updated, error } = await fromTable(input.supabase, "ai_action_previews")
        .update({ status: "expired" })
        .eq("shop_id", row.shop_id)
        .eq("id", row.id)
        .eq("status", row.status)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (error) {
        warnings.push(`Failed to expire action preview ${row.id}: ${error.message}`);
        continue;
      }

      if (!updated) continue;

      const actor = buildScopedActor({ shopId: row.shop_id, actorContext: input.actorContext });
      await logAiActionEvent(input.supabase, actor, {
        recommendationId: row.recommendation_id,
        actionPreviewId: row.id,
        eventType: AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_EXPIRED,
        idempotencyKey: row.idempotency_key,
        payload: {
          action_preview_id: row.id,
          previous_status: row.status,
          expires_at: row.expires_at,
          expired_at: nowIso,
          reason: EXPIRY_REASON,
        },
      });

      previews.expired += 1;
    }

    for (const row of approvalCandidates) {
      const { data: updated, error } = await fromTable(input.supabase, "ai_action_approvals")
        .update({ status: "expired" })
        .eq("shop_id", row.shop_id)
        .eq("id", row.id)
        .eq("status", row.status)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (error) {
        warnings.push(`Failed to expire action approval ${row.id}: ${error.message}`);
        continue;
      }

      if (!updated) continue;

      const previewReference = previewReferenceById.get(row.action_preview_id);
      const actor = buildScopedActor({ shopId: row.shop_id, actorContext: input.actorContext });
      await logAiActionEvent(input.supabase, actor, {
        recommendationId: previewReference?.recommendation_id ?? null,
        actionPreviewId: row.action_preview_id,
        approvalId: row.id,
        eventType: AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_EXPIRED,
        idempotencyKey: previewReference?.idempotency_key ?? null,
        payload: {
          approval_id: row.id,
          action_preview_id: row.action_preview_id,
          previous_status: row.status,
          expires_at: row.expires_at,
          expired_at: nowIso,
          reason: EXPIRY_REASON,
        },
      });

      approvals.expired += 1;
    }
  }

  return {
    dryRun,
    now: nowIso,
    recommendations,
    previews,
    approvals,
    warnings,
  };
}
