import type { Json } from "@shared/types/types/supabase";
import {
  type AiActorContext,
  type AiRecommendationPriority,
  type AiRecommendationRecord,
  type AiRecommendationStatus,
  type AiRiskTier,
  assertNonEmpty,
  ensureActorContext,
  fromTable,
  normalizeArrayJson,
  normalizeObjectJson,
  type AiServerClient,
  validateConfidence,
  validateRiskTier,
} from "./types";
import { logAiActionEvent } from "./actionEvents";

const STATUS_TRANSITIONS: Record<AiRecommendationStatus, ReadonlyArray<AiRecommendationStatus>> = {
  open: ["acknowledged", "dismissed", "resolved", "expired", "superseded"],
  acknowledged: ["dismissed", "resolved", "expired", "superseded"],
  dismissed: [],
  resolved: [],
  expired: [],
  superseded: [],
};

function validatePriority(value: string): AiRecommendationPriority {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value;
  }
  throw new Error(`invalid priority: ${value}`);
}

function ensureTransition(from: AiRecommendationStatus, to: AiRecommendationStatus) {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new Error(`invalid recommendation status transition ${from} -> ${to}`);
  }
}

type CreateAiRecommendationInput = {
  domain: string;
  recommendationType: string;
  subjectType: string;
  subjectId?: string | null;
  title: string;
  summary?: string | null;
  priority?: AiRecommendationPriority;
  confidence?: number | null;
  riskTier?: AiRiskTier;
  evidenceSnapshotId?: string | null;
  evidenceSnapshotIds?: string[];
  missingData?: Json;
  recommendedAction?: Json;
  sideEffects?: Json;
  requiresApproval?: boolean;
  requiresOwnerPin?: boolean;
  source?: string;
  sourceRunId?: string | null;
  assignedTo?: string | null;
  expiresAt?: string | null;
  metadata?: Json;
};

export async function createAiRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: CreateAiRecommendationInput,
): Promise<AiRecommendationRecord> {
  const ctx = ensureActorContext(actor);

  const priority = validatePriority(input.priority ?? "normal");
  const riskTier = validateRiskTier(input.riskTier ?? "low");

  const insertPayload = {
    shop_id: ctx.shopId,
    domain: assertNonEmpty(input.domain, "domain"),
    recommendation_type: assertNonEmpty(input.recommendationType, "recommendationType"),
    subject_type: assertNonEmpty(input.subjectType, "subjectType"),
    subject_id: input.subjectId ?? null,
    title: assertNonEmpty(input.title, "title"),
    summary: input.summary ?? null,
    status: "open",
    priority,
    confidence: validateConfidence(input.confidence),
    risk_tier: riskTier,
    evidence_snapshot_id: input.evidenceSnapshotId ?? null,
    evidence_snapshot_ids: input.evidenceSnapshotIds ?? [],
    missing_data: normalizeArrayJson(input.missingData),
    recommended_action: normalizeObjectJson(input.recommendedAction),
    side_effects: normalizeArrayJson(input.sideEffects),
    requires_approval: input.requiresApproval ?? false,
    requires_owner_pin: input.requiresOwnerPin ?? false,
    source: input.source ?? ctx.source,
    source_run_id: input.sourceRunId ?? null,
    created_by: ctx.actorId,
    assigned_to: input.assignedTo ?? null,
    expires_at: input.expiresAt ?? null,
    metadata: normalizeObjectJson(input.metadata),
  };

  const { data, error } = await fromTable(supabase, "ai_recommendations")
    .insert(insertPayload)
    .select("*")
    .single<AiRecommendationRecord>();

  if (error) throw new Error(error.message);

  await logAiActionEvent(supabase, ctx, {
    recommendationId: data.id,
    eventType: "recommendation.created",
    payload: {
      recommendation_id: data.id,
      title: data.title,
      risk_tier: data.risk_tier,
      requires_approval: data.requires_approval,
    },
  });

  return data;
}

export async function getAiRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
): Promise<AiRecommendationRecord | null> {
  const ctx = ensureActorContext(actor);

  const { data, error } = await fromTable(supabase, "ai_recommendations")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("id", recommendationId)
    .maybeSingle<AiRecommendationRecord>();

  if (error) throw new Error(error.message);
  return data;
}

export async function listOpenAiRecommendations(
  supabase: AiServerClient,
  actor: AiActorContext,
  input?: { domain?: string; limit?: number },
): Promise<AiRecommendationRecord[]> {
  const ctx = ensureActorContext(actor);

  let query = fromTable(supabase, "ai_recommendations")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input?.limit ?? 100, 1), 200));

  if (input?.domain) {
    query = query.eq("domain", input.domain);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as AiRecommendationRecord[];
}

export async function listAiRecommendationsForSubject(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: { subjectType: string; subjectId?: string | null; domain?: string; limit?: number },
): Promise<AiRecommendationRecord[]> {
  const ctx = ensureActorContext(actor);

  let query = fromTable(supabase, "ai_recommendations")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("subject_type", assertNonEmpty(input.subjectType, "subjectType"))
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 100, 1), 200));

  if (input.subjectId) {
    query = query.eq("subject_id", input.subjectId);
  }

  if (input.domain) {
    query = query.eq("domain", input.domain);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as AiRecommendationRecord[];
}

async function updateRecommendationStatus(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
  nextStatus: AiRecommendationStatus,
  eventType: "recommendation.acknowledged" | "recommendation.dismissed" | "recommendation.resolved",
  input?: { note?: string | null },
): Promise<AiRecommendationRecord> {
  const ctx = ensureActorContext(actor);
  const existing = await getAiRecommendation(supabase, ctx, recommendationId);

  if (!existing) throw new Error("recommendation not found");
  ensureTransition(existing.status, nextStatus);

  const now = new Date().toISOString();
  const updatePayload: Record<string, string | null> = {
    status: nextStatus,
  };

  if (nextStatus === "dismissed") {
    updatePayload.dismissed_by = ctx.actorId;
    updatePayload.dismissed_at = now;
  }

  if (nextStatus === "resolved") {
    updatePayload.resolved_by = ctx.actorId;
    updatePayload.resolved_at = now;
  }

  const { data, error } = await fromTable(supabase, "ai_recommendations")
    .update(updatePayload)
    .eq("shop_id", ctx.shopId)
    .eq("id", recommendationId)
    .select("*")
    .single<AiRecommendationRecord>();

  if (error) throw new Error(error.message);

  await logAiActionEvent(supabase, ctx, {
    recommendationId,
    eventType,
    payload: {
      recommendation_id: recommendationId,
      from_status: existing.status,
      to_status: nextStatus,
      note: input?.note ?? null,
    },
  });

  return data;
}

export function canTransitionAiRecommendationStatus(
  from: AiRecommendationStatus,
  to: AiRecommendationStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export async function acknowledgeAiRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
  input?: { note?: string | null },
): Promise<AiRecommendationRecord> {
  return updateRecommendationStatus(
    supabase,
    actor,
    recommendationId,
    "acknowledged",
    "recommendation.acknowledged",
    input,
  );
}

export async function dismissAiRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
  input?: { note?: string | null },
): Promise<AiRecommendationRecord> {
  return updateRecommendationStatus(
    supabase,
    actor,
    recommendationId,
    "dismissed",
    "recommendation.dismissed",
    input,
  );
}

export async function resolveAiRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
  input?: { note?: string | null },
): Promise<AiRecommendationRecord> {
  return updateRecommendationStatus(
    supabase,
    actor,
    recommendationId,
    "resolved",
    "recommendation.resolved",
    input,
  );
}
