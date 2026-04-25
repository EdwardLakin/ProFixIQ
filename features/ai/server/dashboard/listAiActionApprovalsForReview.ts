import type { Json } from "@shared/types/types/supabase";
import { ensureActorContext, fromTable, type AiActorContext, type AiServerClient } from "@/features/ai/server/types";

export type AiApprovalInboxStatus = "pending" | "approved" | "rejected" | "expired";
export type AiApprovalInboxDomainFilter = "all" | "work_orders" | "shop_boost";
export type AiApprovalInboxStatusFilter = AiApprovalInboxStatus | "all";
export type AiApprovalInboxRiskFilter = "all" | "low" | "medium" | "high" | "critical";

export type AiApprovalInboxRow = {
  id: string;
  status: AiApprovalInboxStatus;
  domain: string;
  subjectType: string | null;
  subjectId: string | null;
  subjectHref: string | null;
  title: string;
  description: string;
  riskLevel: string | null;
  approvalRequired: boolean;
  ownerPinRequired: boolean;
  ownerPinProofAttached: boolean;
  requestedAt: string | null;
  requestedByLabel: string | null;
  decidedAt: string | null;
  decidedByLabel: string | null;
  previewId: string | null;
  recommendationId: string | null;
  previewStatus: string | null;
  recommendationStatus: string | null;
  executionBlocked: true;
};

export type AiApprovalInboxSummary = {
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  ownerPinRequired: number;
  highRisk: number;
};

export type AiApprovalInboxResult = {
  rows: AiApprovalInboxRow[];
  summary: AiApprovalInboxSummary;
  nextCursor: string | null;
};

export type ListAiActionApprovalsForReviewInput = {
  supabase: AiServerClient;
  actorContext: AiActorContext;
  filters?: {
    status?: AiApprovalInboxStatusFilter;
    domain?: AiApprovalInboxDomainFilter;
    risk?: AiApprovalInboxRiskFilter;
    search?: string;
  };
  pagination?: {
    limit?: number;
    cursor?: string | null;
  };
};

type ApprovalRow = {
  id: string;
  action_preview_id: string;
  status: string;
  owner_pin_required: boolean;
  owner_pin_verification_ref: string | null;
  requested_at: string | null;
  requested_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  metadata: Json;
};

type PreviewRow = {
  id: string;
  recommendation_id: string | null;
  action_type: string;
  domain: string;
  subject_type: string;
  subject_id: string | null;
  status: string;
  requires_approval: boolean;
  risk_tier: "low" | "medium" | "high" | "critical";
  preview_payload: Json;
};

type RecommendationRow = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function safeSearchTerm(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[,%]/g, "");
  return cleaned.length > 0 ? cleaned.toLowerCase() : null;
}

function parseCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function toSubjectHref(subjectType: string | null, subjectId: string | null, domain: string): string | null {
  if (subjectType === "work_order" && subjectId) return `/work-orders/${subjectId}`;
  if (domain === "shop_boost") return "/dashboard/setup/review?source=shop-boost";
  return null;
}

function toApprovalStatus(status: string): AiApprovalInboxStatus | null {
  if (status === "pending" || status === "approved" || status === "rejected" || status === "expired") {
    return status;
  }
  return null;
}

const SENSITIVE_PREVIEW_TEXT_PATTERN = /\b(token|secret|owner[_\s-]?pin|pin|hash|proof|owner[_\s-]?pin[_\s-]?verification[_\s-]?ref|ownerPinProofRef)\b/i;

function looksLikeBlob(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length > 280) return true;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) return true;
  return false;
}

function safePreviewText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (SENSITIVE_PREVIEW_TEXT_PATTERN.test(trimmed)) return null;
  if (looksLikeBlob(trimmed)) return null;
  return trimmed;
}

function parsePreviewPayload(value: Json): { label: string | null; description: string | null; ownerPinProofAttached: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { label: null, description: null, ownerPinProofAttached: false };
  }

  const payload = value as Record<string, unknown>;
  return {
    label: safePreviewText(payload.label),
    description: safePreviewText(payload.description),
    ownerPinProofAttached: false,
  };
}

function fallbackInboxTitle(preview: PreviewRow): string {
  return `Review ${preview.domain} ${preview.action_type} action`;
}

function fallbackInboxDescription(preview: PreviewRow): string {
  return `Review-only ${preview.status} request for ${preview.subject_type}.`;
}

function hasOwnerPinProofRef(value: Json): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  const ref = metadata.ownerPinProofRef;
  return Boolean(ref && typeof ref === "object" && !Array.isArray(ref));
}

function containsSearch(row: AiApprovalInboxRow, term: string | null): boolean {
  if (!term) return true;

  const haystack = [
    row.title,
    row.description,
    row.domain,
    row.subjectType ?? "",
    row.subjectId ?? "",
    row.requestedByLabel ?? "",
    row.decidedByLabel ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}

function actorLabel(profile: ProfileRow | undefined, actorId: string | null): string | null {
  if (!actorId) return null;
  if (profile?.full_name) return profile.full_name;
  if (profile?.email) return profile.email;
  return `User ${actorId.slice(0, 8)}`;
}

export async function listAiActionApprovalsForReview(
  input: ListAiActionApprovalsForReviewInput,
): Promise<AiApprovalInboxResult> {
  const actor = ensureActorContext(input.actorContext);
  const statusFilter = input.filters?.status ?? "pending";
  const domainFilter = input.filters?.domain ?? "all";
  const riskFilter = input.filters?.risk ?? "all";
  const searchTerm = safeSearchTerm(input.filters?.search);
  const limit = Math.max(1, Math.min(input.pagination?.limit ?? 25, 100));
  const cursorOffset = parseCursor(input.pagination?.cursor);

  let approvalQuery = fromTable(input.supabase, "ai_action_approvals")
    .select("id, action_preview_id, status, owner_pin_required, owner_pin_verification_ref, requested_at, requested_by, decided_at, decided_by, metadata")
    .eq("shop_id", actor.shopId)
    .limit(600);

  if (statusFilter !== "all") {
    approvalQuery = approvalQuery.eq("status", statusFilter);
  }

  const { data: approvalData, error: approvalError } = await approvalQuery;
  if (approvalError) throw new Error(approvalError.message);

  const approvals = ((approvalData ?? []) as ApprovalRow[])
    .map((row) => ({ row, status: toApprovalStatus(row.status) }))
    .filter((row): row is { row: ApprovalRow; status: AiApprovalInboxStatus } => Boolean(row.status));

  const previewIds = approvals.map((item) => item.row.action_preview_id);

  const previewsById = new Map<string, PreviewRow>();
  if (previewIds.length > 0) {
    const { data: previewData, error: previewError } = await fromTable(input.supabase, "ai_action_previews")
      .select("id, recommendation_id, action_type, domain, subject_type, subject_id, status, requires_approval, risk_tier, preview_payload")
      .eq("shop_id", actor.shopId)
      .in("id", previewIds);

    if (previewError) throw new Error(previewError.message);
    for (const preview of (previewData ?? []) as PreviewRow[]) {
      previewsById.set(preview.id, preview);
    }
  }

  const recommendationIds = Array.from(new Set(Array.from(previewsById.values()).flatMap((preview) => (
    preview.recommendation_id ? [preview.recommendation_id] : []
  ))));

  const recommendationsById = new Map<string, RecommendationRow>();
  if (recommendationIds.length > 0) {
    const { data: recommendationData, error: recommendationError } = await fromTable(input.supabase, "ai_recommendations")
      .select("id, title, summary, status")
      .eq("shop_id", actor.shopId)
      .in("id", recommendationIds);

    if (recommendationError) throw new Error(recommendationError.message);
    for (const recommendation of (recommendationData ?? []) as RecommendationRow[]) {
      recommendationsById.set(recommendation.id, recommendation);
    }
  }

  const actorIds = Array.from(
    new Set(
      approvals.flatMap((item) => [item.row.requested_by, item.row.decided_by].filter((id): id is string => Boolean(id))),
    ),
  );

  const profilesById = new Map<string, ProfileRow>();
  if (actorIds.length > 0) {
    const { data: profileData, error: profileError } = await fromTable(input.supabase, "profiles")
      .select("id, full_name, email")
      .eq("shop_id", actor.shopId)
      .in("id", actorIds);

    if (!profileError) {
      for (const profile of (profileData ?? []) as ProfileRow[]) {
        profilesById.set(profile.id, profile);
      }
    }
  }

  const rows = approvals
    .map(({ row, status }) => {
      const preview = previewsById.get(row.action_preview_id);
      if (!preview) return null;

      if (domainFilter !== "all" && preview.domain !== domainFilter) return null;
      if (riskFilter !== "all" && preview.risk_tier !== riskFilter) return null;

      const recommendation = preview.recommendation_id ? recommendationsById.get(preview.recommendation_id) : undefined;
      const previewPayload = parsePreviewPayload(preview.preview_payload);

      const title = recommendation?.title ?? previewPayload.label ?? fallbackInboxTitle(preview);
      const description = recommendation?.summary ?? previewPayload.description ?? fallbackInboxDescription(preview);

      const inboxRow: AiApprovalInboxRow = {
        id: row.id,
        status,
        domain: preview.domain,
        subjectType: preview.subject_type,
        subjectId: preview.subject_id,
        subjectHref: toSubjectHref(preview.subject_type, preview.subject_id, preview.domain),
        title,
        description,
        riskLevel: preview.risk_tier,
        approvalRequired: preview.requires_approval,
        ownerPinRequired: row.owner_pin_required,
        ownerPinProofAttached: Boolean(row.owner_pin_verification_ref) || hasOwnerPinProofRef(row.metadata) || previewPayload.ownerPinProofAttached,
        requestedAt: row.requested_at,
        requestedByLabel: actorLabel(profilesById.get(row.requested_by ?? ""), row.requested_by),
        decidedAt: row.decided_at,
        decidedByLabel: actorLabel(profilesById.get(row.decided_by ?? ""), row.decided_by),
        previewId: preview.id,
        recommendationId: preview.recommendation_id,
        previewStatus: preview.status,
        recommendationStatus: recommendation?.status ?? null,
        executionBlocked: true,
      };

      if (!containsSearch(inboxRow, searchTerm)) return null;
      return inboxRow;
    })
    .filter((row): row is AiApprovalInboxRow => Boolean(row));

  const sorted = rows.sort((a, b) => {
    const statusRank = (value: AiApprovalInboxStatus) => {
      if (value === "pending") return 0;
      if (value === "approved") return 1;
      if (value === "rejected") return 2;
      return 3;
    };

    const statusDelta = statusRank(a.status) - statusRank(b.status);
    if (statusDelta !== 0) return statusDelta;

    return Date.parse(b.requestedAt ?? "") - Date.parse(a.requestedAt ?? "");
  });

  const summary: AiApprovalInboxSummary = {
    pending: sorted.filter((row) => row.status === "pending").length,
    approved: sorted.filter((row) => row.status === "approved").length,
    rejected: sorted.filter((row) => row.status === "rejected").length,
    expired: sorted.filter((row) => row.status === "expired").length,
    ownerPinRequired: sorted.filter((row) => row.ownerPinRequired).length,
    highRisk: sorted.filter((row) => row.riskLevel === "high" || row.riskLevel === "critical").length,
  };

  const pageRows = sorted.slice(cursorOffset, cursorOffset + limit + 1);
  const hasMore = pageRows.length > limit;

  return {
    rows: pageRows.slice(0, limit),
    summary,
    nextCursor: hasMore ? String(cursorOffset + limit) : null,
  };
}
