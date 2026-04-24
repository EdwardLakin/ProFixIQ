import type { Json } from "@shared/types/types/supabase";
import { ensureActorContext, fromTable, type AiActorContext, type AiRecommendationStatus, type AiServerClient } from "@/features/ai/server/types";

export type AiReviewDomainFilter = "all" | "work_orders" | "shop_boost";
export type AiReviewStatusFilter = AiRecommendationStatus | "all";
export type AiReviewRiskFilter = "all" | "urgent" | "high" | "medium" | "low";
export type AiReviewBooleanFilter = "all" | boolean;

export type ListAiRecommendationsForReviewInput = {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  filters?: {
    domain?: AiReviewDomainFilter;
    status?: AiReviewStatusFilter;
    risk?: AiReviewRiskFilter;
    missingData?: AiReviewBooleanFilter;
    hasPreview?: AiReviewBooleanFilter;
    requiresApproval?: AiReviewBooleanFilter;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
  };
  pagination?: {
    limit?: number;
    cursor?: string | null;
  };
};

type RecommendationRow = {
  id: string;
  domain: "work_orders" | "shop_boost";
  recommendation_type: string;
  subject_type: string;
  subject_id: string | null;
  title: string;
  summary: string | null;
  status: AiRecommendationStatus;
  priority: "low" | "normal" | "high" | "urgent";
  risk_tier: "low" | "medium" | "high" | "critical";
  confidence: number | null;
  missing_data: Json;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  source: string;
  recommended_action: Json;
  requires_approval: boolean;
};

type PreviewRow = {
  id: string;
  recommendation_id: string | null;
  status: string;
  requires_approval: boolean;
};

type ApprovalRow = {
  action_preview_id: string;
  status: string;
};

export type AiRecommendationReviewRow = {
  id: string;
  domain: "work_orders" | "shop_boost";
  subjectType: string;
  subjectId: string | null;
  title: string;
  summary: string | null;
  status: AiRecommendationStatus;
  priority: "low" | "normal" | "high" | "urgent";
  riskTier: "low" | "medium" | "high" | "critical";
  confidence: number | null;
  missingDataCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  source: string;
  recommendationType: string;
  recommendedActionType: string | null;
  targetLabel: string;
  targetHref: string | null;
  hasPreview: boolean;
  previewStatus: string | null;
  pendingApprovalCount: number;
  requiresApproval: boolean;
};

export type AiRecommendationsReviewSummary = {
  total: number;
  open: number;
  acknowledged: number;
  urgent: number;
  high: number;
  missingData: number;
  pendingApprovals: number;
  previewsReady: number;
};

export type ListAiRecommendationsForReviewResult = {
  items: AiRecommendationReviewRow[];
  summary: AiRecommendationsReviewSummary;
  nextCursor: string | null;
};

function toMissingDataCount(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function toRecommendedActionType(value: Json): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const typeValue = (value as Record<string, unknown>).type;
  return typeof typeValue === "string" ? typeValue : null;
}

function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function safeSearchTerm(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[,%]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function toTarget(row: RecommendationRow): { targetLabel: string; targetHref: string | null } {
  if (row.subject_type === "work_order" && row.subject_id) {
    return {
      targetLabel: `Work order ${row.subject_id}`,
      targetHref: `/work-orders/${row.subject_id}`,
    };
  }

  if (row.domain === "shop_boost") {
    return {
      targetLabel: "Shop Boost review",
      targetHref: "/dashboard/setup/review?source=shop-boost",
    };
  }

  return {
    targetLabel: row.subject_id ? `${row.subject_type} ${row.subject_id}` : row.subject_type,
    targetHref: null,
  };
}

function priorityRank(priority: RecommendationRow["priority"]): number {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

function statusRank(status: RecommendationRow["status"]): number {
  if (status === "open") return 0;
  if (status === "acknowledged") return 1;
  if (status === "resolved") return 2;
  if (status === "dismissed") return 3;
  if (status === "expired") return 4;
  return 5;
}

function riskMatchesFilter(row: RecommendationRow, riskFilter: AiReviewRiskFilter): boolean {
  if (riskFilter === "all") return true;
  if (riskFilter === "urgent") return row.priority === "urgent" || row.risk_tier === "critical";
  if (riskFilter === "high") return row.priority === "high" || row.risk_tier === "high";
  if (riskFilter === "medium") return row.priority === "normal" || row.risk_tier === "medium";
  return row.priority === "low" || row.risk_tier === "low";
}

function formatPreviewStatus(statusCounts: Map<string, number>): string | null {
  if (statusCounts.size === 0) return null;
  return Array.from(statusCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, count]) => `${status}:${count}`)
    .join(" • ");
}

export async function listAiRecommendationsForReview(
  input: ListAiRecommendationsForReviewInput,
): Promise<ListAiRecommendationsForReviewResult> {
  const actor = ensureActorContext(input.actorContext);
  const domainFilter = input.filters?.domain ?? "all";
  const statusFilter = input.filters?.status ?? "all";
  const riskFilter = input.filters?.risk ?? "all";
  const missingDataFilter = input.filters?.missingData ?? "all";
  const hasPreviewFilter = input.filters?.hasPreview ?? "all";
  const requiresApprovalFilter = input.filters?.requiresApproval ?? "all";
  const searchTerm = safeSearchTerm(input.filters?.search);

  const limit = Math.max(1, Math.min(input.pagination?.limit ?? 25, 100));
  const cursorOffset = parseCursor(input.pagination?.cursor);

  let query = fromTable(input.supabase, "ai_recommendations")
    .select("id, domain, recommendation_type, subject_type, subject_id, title, summary, status, priority, risk_tier, confidence, missing_data, created_at, updated_at, expires_at, source, recommended_action, requires_approval")
    .eq("shop_id", actor.shopId)
    .limit(500);

  if (domainFilter !== "all") query = query.eq("domain", domainFilter);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (searchTerm) {
    query = query.or(`title.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`);
  }
  if (input.filters?.createdFrom) query = query.gte("created_at", input.filters.createdFrom);
  if (input.filters?.createdTo) query = query.lte("created_at", input.filters.createdTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const allRows = (data ?? []) as RecommendationRow[];
  const recommendationIds = allRows.map((row) => row.id);

  const previewsByRecommendation = new Map<string, PreviewRow[]>();
  const previewIds: string[] = [];

  if (recommendationIds.length > 0) {
    const { data: previewData, error: previewError } = await fromTable(input.supabase, "ai_action_previews")
      .select("id, recommendation_id, status, requires_approval")
      .eq("shop_id", actor.shopId)
      .in("recommendation_id", recommendationIds);

    if (!previewError) {
      for (const preview of (previewData ?? []) as PreviewRow[]) {
        if (!preview.recommendation_id) continue;
        previewIds.push(preview.id);
        const bucket = previewsByRecommendation.get(preview.recommendation_id) ?? [];
        bucket.push(preview);
        previewsByRecommendation.set(preview.recommendation_id, bucket);
      }
    }
  }

  const pendingApprovalCountByRecommendation = new Map<string, number>();

  if (previewIds.length > 0) {
    const { data: approvalData, error: approvalError } = await fromTable(input.supabase, "ai_action_approvals")
      .select("action_preview_id, status")
      .eq("shop_id", actor.shopId)
      .eq("status", "pending")
      .in("action_preview_id", previewIds);

    if (!approvalError) {
      const previewToRecommendation = new Map<string, string>();
      for (const [recommendationId, previews] of previewsByRecommendation.entries()) {
        for (const preview of previews) previewToRecommendation.set(preview.id, recommendationId);
      }

      for (const approval of (approvalData ?? []) as ApprovalRow[]) {
        const recommendationId = previewToRecommendation.get(approval.action_preview_id);
        if (!recommendationId) continue;
        const prev = pendingApprovalCountByRecommendation.get(recommendationId) ?? 0;
        pendingApprovalCountByRecommendation.set(recommendationId, prev + 1);
      }
    }
  }

  const filteredRows = allRows.filter((row) => {
    if (!riskMatchesFilter(row, riskFilter)) return false;

    const missingDataCount = toMissingDataCount(row.missing_data);
    if (typeof missingDataFilter === "boolean") {
      if (missingDataFilter && missingDataCount <= 0) return false;
      if (!missingDataFilter && missingDataCount > 0) return false;
    }

    const previews = previewsByRecommendation.get(row.id) ?? [];
    const hasPreview = previews.length > 0;
    if (typeof hasPreviewFilter === "boolean" && hasPreview !== hasPreviewFilter) return false;

    if (typeof requiresApprovalFilter === "boolean" && row.requires_approval !== requiresApprovalFilter) return false;

    return true;
  });

  const sortedRows = filteredRows.sort((a, b) => {
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;

    const s = statusRank(a.status) - statusRank(b.status);
    if (s !== 0) return s;

    const updatedDelta = Date.parse(b.updated_at) - Date.parse(a.updated_at);
    if (updatedDelta !== 0) return updatedDelta;

    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });

  const pageRows = sortedRows.slice(cursorOffset, cursorOffset + limit + 1);
  const hasMore = pageRows.length > limit;
  const items = pageRows.slice(0, limit).map((row) => {
    const previews = previewsByRecommendation.get(row.id) ?? [];
    const previewStatusCounts = new Map<string, number>();
    let readyPreviewCount = 0;

    for (const preview of previews) {
      previewStatusCounts.set(preview.status, (previewStatusCounts.get(preview.status) ?? 0) + 1);
      if (preview.status === "ready") readyPreviewCount += 1;
    }

    const target = toTarget(row);

    return {
      id: row.id,
      domain: row.domain,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      title: row.title,
      summary: row.summary,
      status: row.status,
      priority: row.priority,
      riskTier: row.risk_tier,
      confidence: row.confidence,
      missingDataCount: toMissingDataCount(row.missing_data),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      source: row.source,
      recommendationType: row.recommendation_type,
      recommendedActionType: toRecommendedActionType(row.recommended_action),
      targetLabel: target.targetLabel,
      targetHref: target.targetHref,
      hasPreview: previews.length > 0,
      previewStatus: formatPreviewStatus(previewStatusCounts),
      pendingApprovalCount: pendingApprovalCountByRecommendation.get(row.id) ?? 0,
      requiresApproval: row.requires_approval,
      previewsReady: readyPreviewCount,
    };
  });

  const summary: AiRecommendationsReviewSummary = {
    total: sortedRows.length,
    open: sortedRows.filter((row) => row.status === "open").length,
    acknowledged: sortedRows.filter((row) => row.status === "acknowledged").length,
    urgent: sortedRows.filter((row) => row.priority === "urgent").length,
    high: sortedRows.filter((row) => row.priority === "high").length,
    missingData: sortedRows.filter((row) => toMissingDataCount(row.missing_data) > 0).length,
    pendingApprovals: sortedRows.reduce((sum, row) => sum + (pendingApprovalCountByRecommendation.get(row.id) ?? 0), 0),
    previewsReady: sortedRows.filter((row) => {
      const previews = previewsByRecommendation.get(row.id) ?? [];
      return previews.some((preview) => preview.status === "ready");
    }).length,
  };

  return {
    items: items.map(({ previewsReady: _unused, ...row }) => row),
    summary,
    nextCursor: hasMore ? String(cursorOffset + limit) : null,
  };
}
