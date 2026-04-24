import { AI_ACTION_EVENT_TYPES } from "@/features/ai/server/eventTypes";
import { logAiActionEvent } from "@/features/ai/server/actionEvents";
import { ensureActorContext, fromTable, type AiActorContext, type AiRecommendationStatus, type AiRiskTier, type AiServerClient } from "@/features/ai/server/types";

const MAX_BULK_RECOMMENDATIONS = 100;
const ELIGIBLE_STATUSES: ReadonlyArray<AiRecommendationStatus> = ["open", "acknowledged"];

type BulkLifecycleAction = "dismiss" | "resolve";
type BulkLifecycleDomain = "work_orders" | "shop_boost";

type BulkStatusFilter = "open" | "acknowledged";

type BulkReviewFilters = {
  status?: BulkStatusFilter;
  risk?: AiRiskTier;
  recommendationType?: string;
  subjectType?: string;
  subjectId?: string;
  olderThan?: string;
  staleOnly?: boolean;
};

type BulkUpdateInput = {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  action: BulkLifecycleAction;
  domain: BulkLifecycleDomain;
  confirm: string;
  limit?: number;
  filters?: BulkReviewFilters;
};

type BulkUpdateResult = {
  matchedCount: number;
  updatedCount: number;
  skippedCount: number;
  action: BulkLifecycleAction;
  domain: BulkLifecycleDomain;
  executionBlocked: true;
  sampleUpdatedIds: string[];
};

type RecommendationRow = {
  id: string;
  shop_id: string;
  domain: BulkLifecycleDomain;
  status: AiRecommendationStatus;
  recommendation_type: string;
  subject_type: string;
  subject_id: string | null;
  risk_tier: AiRiskTier;
  expires_at: string | null;
  created_at: string;
};


function assertBulkAction(value: string): BulkLifecycleAction {
  if (value !== "dismiss" && value !== "resolve") {
    throw new Error("action must be dismiss or resolve");
  }
  return value;
}

function assertBulkDomain(value: string): BulkLifecycleDomain {
  if (value !== "work_orders" && value !== "shop_boost") {
    throw new Error("domain must be work_orders or shop_boost");
  }
  return value;
}

const BULK_CONFIRMATION_TOKENS: Record<BulkLifecycleAction, Record<BulkLifecycleDomain, string>> = {
  dismiss: {
    work_orders: "DISMISS_WORK_ORDERS_RECOMMENDATIONS",
    shop_boost: "DISMISS_SHOP_BOOST_RECOMMENDATIONS",
  },
  resolve: {
    work_orders: "RESOLVE_WORK_ORDERS_RECOMMENDATIONS",
    shop_boost: "RESOLVE_SHOP_BOOST_RECOMMENDATIONS",
  },
};

function sanitizeOptionalFilter(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function validateBoundedLimit(limit: number | undefined): number {
  const resolved = limit ?? 50;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_BULK_RECOMMENDATIONS) {
    throw new Error(`limit must be an integer between 1 and ${MAX_BULK_RECOMMENDATIONS}`);
  }
  return resolved;
}

function validateConfirmation(input: { action: BulkLifecycleAction; domain: BulkLifecycleDomain; confirm: string }) {
  const expected = BULK_CONFIRMATION_TOKENS[input.action][input.domain];
  if (input.confirm !== expected) {
    throw new Error(`Invalid confirmation token. Expected: ${expected}`);
  }
}

function validateIsoDate(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid ISO-8601 timestamp`);
  return new Date(timestamp).toISOString();
}

export async function bulkUpdateAiRecommendationsForReview(input: BulkUpdateInput): Promise<BulkUpdateResult> {
  const actor = ensureActorContext(input.actorContext);
  const action = assertBulkAction(input.action);
  const domain = assertBulkDomain(input.domain);
  const limit = validateBoundedLimit(input.limit);

  validateConfirmation({
    action,
    domain,
    confirm: input.confirm,
  });

  const recommendationType = sanitizeOptionalFilter(input.filters?.recommendationType);
  const subjectType = sanitizeOptionalFilter(input.filters?.subjectType);
  const subjectId = sanitizeOptionalFilter(input.filters?.subjectId);
  const olderThan = validateIsoDate(sanitizeOptionalFilter(input.filters?.olderThan), "olderThan");

  let query = fromTable(input.supabase, "ai_recommendations")
    .select("id, shop_id, domain, status, recommendation_type, subject_type, subject_id, risk_tier, expires_at, created_at")
    .eq("shop_id", actor.shopId)
    .eq("domain", domain)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (input.filters?.status) query = query.eq("status", input.filters.status);
  if (input.filters?.risk) query = query.eq("risk_tier", input.filters.risk);
  if (recommendationType) query = query.eq("recommendation_type", recommendationType);
  if (subjectType) query = query.eq("subject_type", subjectType);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (olderThan) query = query.lte("created_at", olderThan);

  if (input.filters?.staleOnly) {
    query = query.not("expires_at", "is", null).lte("expires_at", new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RecommendationRow[];
  let updatedCount = 0;
  let skippedCount = 0;
  const sampleUpdatedIds: string[] = [];

  for (const row of rows) {
    if (!ELIGIBLE_STATUSES.includes(row.status)) {
      skippedCount += 1;
      continue;
    }

    const nextStatus: AiRecommendationStatus = action === "dismiss" ? "dismissed" : "resolved";
    const now = new Date().toISOString();
    const updatePayload: Record<string, string> = {
      status: nextStatus,
    };

    if (action === "dismiss") {
      updatePayload.dismissed_by = actor.actorId;
      updatePayload.dismissed_at = now;
    } else {
      updatePayload.resolved_by = actor.actorId;
      updatePayload.resolved_at = now;
    }

    const { data: updated, error: updateError } = await fromTable(input.supabase, "ai_recommendations")
      .update(updatePayload)
      .eq("shop_id", actor.shopId)
      .eq("id", row.id)
      .in("status", ELIGIBLE_STATUSES)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      skippedCount += 1;
      continue;
    }

    updatedCount += 1;
    if (sampleUpdatedIds.length < 10) sampleUpdatedIds.push(updated.id);

    await logAiActionEvent(input.supabase, actor, {
      recommendationId: row.id,
      eventType: action === "dismiss" ? AI_ACTION_EVENT_TYPES.RECOMMENDATION_DISMISSED : AI_ACTION_EVENT_TYPES.RECOMMENDATION_RESOLVED,
      payload: {
        recommendation_id: row.id,
        from_status: row.status,
        to_status: nextStatus,
        bulk: true,
        domain,
      },
      metadata: {
        execution_blocked: true,
        review_only: true,
      },
    });
  }

  return {
    matchedCount: rows.length,
    updatedCount,
    skippedCount,
    action,
    domain,
    executionBlocked: true,
    sampleUpdatedIds,
  };
}

export const BULK_RECOMMENDATION_MAX_LIMIT = MAX_BULK_RECOMMENDATIONS;
export const BULK_RECOMMENDATION_CONFIRMATION_TOKENS = BULK_CONFIRMATION_TOKENS;
