import type { Json } from "@shared/types/types/supabase";
import { AI_ACTION_EVENT_TYPES } from "@/features/ai/server/eventTypes";
import { ensureActorContext, fromTable, type AiActionApprovalStatus, type AiActionPreviewStatus, type AiRecommendationStatus, type AiRiskTier, type AiServerClient } from "@/features/ai/server/types";

const DEFAULT_EVENT_WINDOW_DAYS = 7;
const DEFAULT_MAX_ROWS = 5000;

export type GetAiOperationsObservabilityInput = {
  supabase: AiServerClient;
  actorContext: {
    shopId: string;
    actorId: string;
    role?: string | null;
    source: "system" | "planner" | "ops" | "manual";
    capabilities?: ReadonlyArray<string>;
  };
  now?: Date;
};

type RecommendationRow = {
  id: string;
  domain: "work_orders" | "shop_boost";
  status: AiRecommendationStatus;
  risk_tier: AiRiskTier;
  missing_data: Json;
  created_at: string;
  expires_at: string | null;
};

type ActionPreviewRow = {
  id: string;
  domain: "work_orders" | "shop_boost";
  action_type: string;
  status: AiActionPreviewStatus;
  created_at: string;
  expires_at: string | null;
};

type ActionApprovalRow = {
  id: string;
  status: AiActionApprovalStatus;
  owner_pin_required: boolean;
  requested_at: string;
  expires_at: string | null;
};

type ActionEventRow = {
  id: string;
  event_type: string;
  created_at: string;
};

export type AiOperationsObservability = {
  generatedAt: string;
  recommendations: {
    totalActive: number;
    open: number;
    acknowledged: number;
    dismissed: number;
    resolved: number;
    expired: number;
    stale: number;
    highOrCriticalRisk: number;
    needsRefresh: number;
    byDomain: Record<"work_orders" | "shop_boost", number>;
  };
  actionPreviews: {
    total: number;
    ready: number;
    approvalRequired: number;
    expired: number;
    executionBlocked: number;
    byDomain: Record<"work_orders" | "shop_boost", number>;
    byActionType: Array<{ actionType: string; count: number }>;
  };
  approvals: {
    pending: number;
    approved: number;
    rejected: number;
    ownerPinRequiredCount: number;
  };
  expiration: {
    lastExpirationEventAt: string | null;
    recommendationsExpiredLast24h: number;
    recommendationsExpiredLast7d: number;
    previewsExpiredLast24h: number;
    previewsExpiredLast7d: number;
    approvalsExpiredLast24h: number;
    approvalsExpiredLast7d: number;
  };
  events: {
    lastEventAt: string | null;
    recentByType: Array<{ eventType: string; count: number }>;
    recentErrorLikeByType: Array<{ eventType: string; count: number }>;
  };
  health: {
    cronProbablyRunning: boolean | "unknown";
    hasStaleBacklog: boolean;
    hasHighRiskBacklog: boolean;
    hasPendingApprovalBacklog: boolean;
    hasRecentAiActivity: boolean;
  };
};

function isExpiredOrStale(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return false;
  return ts <= nowMs;
}

function hasMissingData(value: Json): boolean {
  return Array.isArray(value) && value.length > 0;
}

function withinWindow(createdAt: string, thresholdMs: number): boolean {
  const createdMs = Date.parse(createdAt);
  return Number.isFinite(createdMs) && createdMs >= thresholdMs;
}

function countByEventType(rows: ActionEventRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.event_type, (counts.get(row.event_type) ?? 0) + 1);
  }
  return counts;
}

function sortCounts(counts: Map<string, number>): Array<{ eventType: string; count: number }> {
  return Array.from(counts.entries())
    .map(([eventType, count]) => ({ eventType, count }))
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));
}

export async function getAiOperationsObservability(input: GetAiOperationsObservabilityInput): Promise<AiOperationsObservability> {
  const actor = ensureActorContext(input.actorContext);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const since24hMs = nowMs - 24 * 60 * 60 * 1000;
  const since7dMs = nowMs - DEFAULT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const since7dIso = new Date(since7dMs).toISOString();

  const [{ data: recommendationsData, error: recommendationsError }, { data: previewsData, error: previewsError }, { data: approvalsData, error: approvalsError }, { data: recentEventsData, error: recentEventsError }, { data: allEventsData, error: allEventsError }] = await Promise.all([
    fromTable(input.supabase, "ai_recommendations")
      .select("id, domain, status, risk_tier, missing_data, created_at, expires_at")
      .eq("shop_id", actor.shopId)
      .limit(DEFAULT_MAX_ROWS),
    fromTable(input.supabase, "ai_action_previews")
      .select("id, domain, action_type, status, created_at, expires_at")
      .eq("shop_id", actor.shopId)
      .limit(DEFAULT_MAX_ROWS),
    fromTable(input.supabase, "ai_action_approvals")
      .select("id, status, owner_pin_required, requested_at, expires_at")
      .eq("shop_id", actor.shopId)
      .limit(DEFAULT_MAX_ROWS),
    fromTable(input.supabase, "ai_action_events")
      .select("id, event_type, created_at")
      .eq("shop_id", actor.shopId)
      .gte("created_at", since7dIso)
      .order("created_at", { ascending: false })
      .limit(DEFAULT_MAX_ROWS),
    fromTable(input.supabase, "ai_action_events")
      .select("id, event_type, created_at")
      .eq("shop_id", actor.shopId)
      .order("created_at", { ascending: false })
      .limit(DEFAULT_MAX_ROWS),
  ]);

  if (recommendationsError) throw new Error(recommendationsError.message);
  if (previewsError) throw new Error(previewsError.message);
  if (approvalsError) throw new Error(approvalsError.message);
  if (recentEventsError) throw new Error(recentEventsError.message);
  if (allEventsError) throw new Error(allEventsError.message);

  const recommendations = (recommendationsData ?? []) as RecommendationRow[];
  const previews = (previewsData ?? []) as ActionPreviewRow[];
  const approvals = (approvalsData ?? []) as ActionApprovalRow[];
  const recentEvents = (recentEventsData ?? []) as ActionEventRow[];
  const allEvents = (allEventsData ?? []) as ActionEventRow[];

  const recommendationsByDomain: Record<"work_orders" | "shop_boost", number> = {
    work_orders: 0,
    shop_boost: 0,
  };
  for (const row of recommendations) {
    recommendationsByDomain[row.domain] += 1;
  }

  const openRecommendations = recommendations.filter((row) => row.status === "open");
  const acknowledgedRecommendations = recommendations.filter((row) => row.status === "acknowledged");
  const activeRecommendations = recommendations.filter((row) => row.status === "open" || row.status === "acknowledged");
  const staleRecommendations = activeRecommendations.filter((row) => isExpiredOrStale(row.expires_at, nowMs));
  const highRiskBacklog = activeRecommendations.filter((row) => row.risk_tier === "high" || row.risk_tier === "critical");
  const needsRefreshRecommendations = activeRecommendations.filter((row) => hasMissingData(row.missing_data) || isExpiredOrStale(row.expires_at, nowMs));

  const previewsByDomain: Record<"work_orders" | "shop_boost", number> = {
    work_orders: 0,
    shop_boost: 0,
  };
  const actionTypeCounts = new Map<string, number>();
  for (const row of previews) {
    previewsByDomain[row.domain] += 1;
    actionTypeCounts.set(row.action_type, (actionTypeCounts.get(row.action_type) ?? 0) + 1);
  }

  const recentEventCounts = countByEventType(recentEvents);
  const blockedExecutionCount = (recentEventCounts.get(AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_BLOCKED_EXECUTION) ?? 0)
    + (recentEventCounts.get(AI_ACTION_EVENT_TYPES.ACTION_EXECUTION_BLOCKED) ?? 0);

  const expirationEventTypes = new Set<string>([
    AI_ACTION_EVENT_TYPES.RECOMMENDATION_EXPIRED,
    AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_EXPIRED,
    AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_EXPIRED,
  ]);

  const expirationEvents = allEvents.filter((row) => expirationEventTypes.has(row.event_type));
  const lastExpirationEventAt = expirationEvents.length > 0 ? expirationEvents[0]?.created_at ?? null : null;

  const recommendationsExpiredLast24h = recentEvents.filter(
    (row) => row.event_type === AI_ACTION_EVENT_TYPES.RECOMMENDATION_EXPIRED && withinWindow(row.created_at, since24hMs),
  ).length;
  const recommendationsExpiredLast7d = recentEvents.filter((row) => row.event_type === AI_ACTION_EVENT_TYPES.RECOMMENDATION_EXPIRED).length;

  const previewsExpiredLast24h = recentEvents.filter(
    (row) => row.event_type === AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_EXPIRED && withinWindow(row.created_at, since24hMs),
  ).length;
  const previewsExpiredLast7d = recentEvents.filter((row) => row.event_type === AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_EXPIRED).length;

  const approvalsExpiredLast24h = recentEvents.filter(
    (row) => row.event_type === AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_EXPIRED && withinWindow(row.created_at, since24hMs),
  ).length;
  const approvalsExpiredLast7d = recentEvents.filter((row) => row.event_type === AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_EXPIRED).length;

  const errorLikeEventTypes = new Set<string>([
    AI_ACTION_EVENT_TYPES.ACTION_EXECUTION_FAILED,
    AI_ACTION_EVENT_TYPES.ACTION_EXECUTION_BLOCKED,
    AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_BLOCKED_EXECUTION,
    AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_INVALID,
    AI_ACTION_EVENT_TYPES.OWNER_PIN_PROOF_MISSING,
  ]);

  const recentErrorLikeCounts = countByEventType(recentEvents.filter((row) => errorLikeEventTypes.has(row.event_type)));

  const lastEventAt = allEvents[0]?.created_at ?? null;

  const hasStaleBacklog = staleRecommendations.length > 0;
  const hasHighRiskBacklog = highRiskBacklog.length > 0;
  const hasPendingApprovalBacklog = approvals.some((row) => row.status === "pending");
  const hasRecentAiActivity =
    recommendations.some((row) => withinWindow(row.created_at, since24hMs))
    || previews.some((row) => withinWindow(row.created_at, since24hMs))
    || approvals.some((row) => withinWindow(row.requested_at, since24hMs))
    || recentEvents.some((row) => withinWindow(row.created_at, since24hMs));

  let cronProbablyRunning: boolean | "unknown" = "unknown";
  if (lastExpirationEventAt) {
    cronProbablyRunning = Date.parse(lastExpirationEventAt) >= nowMs - 36 * 60 * 60 * 1000;
  } else if (hasStaleBacklog || hasPendingApprovalBacklog) {
    cronProbablyRunning = false;
  }

  return {
    generatedAt: nowIso,
    recommendations: {
      totalActive: activeRecommendations.length,
      open: openRecommendations.length,
      acknowledged: acknowledgedRecommendations.length,
      dismissed: recommendations.filter((row) => row.status === "dismissed").length,
      resolved: recommendations.filter((row) => row.status === "resolved").length,
      expired: recommendations.filter((row) => row.status === "expired").length,
      stale: staleRecommendations.length,
      highOrCriticalRisk: highRiskBacklog.length,
      needsRefresh: needsRefreshRecommendations.length,
      byDomain: recommendationsByDomain,
    },
    actionPreviews: {
      total: previews.length,
      ready: previews.filter((row) => row.status === "ready").length,
      approvalRequired: previews.filter((row) => row.status === "approval_required").length,
      expired: previews.filter((row) => row.status === "expired").length,
      executionBlocked: blockedExecutionCount,
      byDomain: previewsByDomain,
      byActionType: Array.from(actionTypeCounts.entries())
        .map(([actionType, count]) => ({ actionType, count }))
        .sort((a, b) => b.count - a.count || a.actionType.localeCompare(b.actionType))
        .slice(0, 6),
    },
    approvals: {
      pending: approvals.filter((row) => row.status === "pending").length,
      approved: approvals.filter((row) => row.status === "approved").length,
      rejected: approvals.filter((row) => row.status === "rejected").length,
      ownerPinRequiredCount: approvals.filter((row) => row.owner_pin_required).length,
    },
    expiration: {
      lastExpirationEventAt,
      recommendationsExpiredLast24h,
      recommendationsExpiredLast7d,
      previewsExpiredLast24h,
      previewsExpiredLast7d,
      approvalsExpiredLast24h,
      approvalsExpiredLast7d,
    },
    events: {
      lastEventAt,
      recentByType: sortCounts(recentEventCounts).slice(0, 10),
      recentErrorLikeByType: sortCounts(recentErrorLikeCounts),
    },
    health: {
      cronProbablyRunning,
      hasStaleBacklog,
      hasHighRiskBacklog,
      hasPendingApprovalBacklog,
      hasRecentAiActivity,
    },
  };
}
