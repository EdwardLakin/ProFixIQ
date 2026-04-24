import type { Json, Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DB = Database;
export type AiServerClient = SupabaseClient<Database>;

export type AiRecommendationStatus =
  | "open"
  | "acknowledged"
  | "dismissed"
  | "resolved"
  | "expired"
  | "superseded";

export type AiRecommendationPriority = "low" | "normal" | "high" | "urgent";
export type AiRiskTier = "low" | "medium" | "high" | "critical";

export type AiActionPreviewStatus =
  | "draft"
  | "ready"
  | "approval_required"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "cancelled"
  | "failed";

export type AiActionApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export type AiActionEventType =
  | "evidence.created"
  | "recommendation.created"
  | "recommendation.acknowledged"
  | "recommendation.dismissed"
  | "recommendation.resolved"
  | "preview.created"
  | "preview.ready"
  | "preview.cancelled"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected";

export type AiActorSource = "system" | "planner" | "ops" | "manual";

export type AiActorContext = {
  shopId: string;
  actorId: string;
  role?: string | null;
  capabilities?: ReadonlyArray<string>;
  source: AiActorSource;
};

export type AiEvidenceSnapshotRecord = {
  id: string;
  shop_id: string;
  subject_type: string;
  subject_id: string | null;
  domain: string;
  evidence_kind: string;
  snapshot: Json;
  source_refs: Json;
  missing_data: Json;
  freshness_at: string | null;
  confidence: number | null;
  created_by: string | null;
  created_at: string;
  metadata: Json;
};

export type AiRecommendationRecord = {
  id: string;
  shop_id: string;
  domain: string;
  recommendation_type: string;
  subject_type: string;
  subject_id: string | null;
  title: string;
  summary: string | null;
  status: AiRecommendationStatus;
  priority: AiRecommendationPriority;
  confidence: number | null;
  risk_tier: AiRiskTier;
  evidence_snapshot_id: string | null;
  evidence_snapshot_ids: string[];
  missing_data: Json;
  recommended_action: Json;
  side_effects: Json;
  requires_approval: boolean;
  requires_owner_pin: boolean;
  source: string;
  source_run_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Json;
};

export type AiActionPreviewRecord = {
  id: string;
  shop_id: string;
  recommendation_id: string | null;
  domain: string;
  action_type: string;
  subject_type: string;
  subject_id: string | null;
  status: AiActionPreviewStatus;
  preview_payload: Json;
  intended_mutations: Json;
  affected_records: Json;
  side_effects: Json;
  compensation_plan: Json;
  idempotency_key: string | null;
  requires_approval: boolean;
  requires_owner_pin: boolean;
  risk_tier: AiRiskTier;
  evidence_snapshot_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  metadata: Json;
};

export type AiActionApprovalRecord = {
  id: string;
  shop_id: string;
  action_preview_id: string;
  status: AiActionApprovalStatus;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  owner_pin_required: boolean;
  owner_pin_verified: boolean;
  owner_pin_verification_ref: string | null;
  expires_at: string | null;
  metadata: Json;
};

export type AiActionEventRecord = {
  id: string;
  shop_id: string;
  recommendation_id: string | null;
  action_preview_id: string | null;
  approval_id: string | null;
  event_type: string;
  actor_id: string | null;
  actor_role: string | null;
  source: string;
  idempotency_key: string | null;
  payload: Json;
  created_at: string;
  metadata: Json;
};

export function assertNonEmpty(value: string, label: string): string {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new Error(`${label} is required`);
  }
  return cleaned;
}

export function validateConfidence(confidence: number | null | undefined): number | null {
  if (confidence == null) return null;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  return confidence;
}

export function normalizeArrayJson(value: Json | null | undefined): Json {
  return Array.isArray(value) ? value : [];
}

export function normalizeObjectJson(value: Json | null | undefined): Json {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function validateRiskTier(value: string): AiRiskTier {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new Error(`invalid risk tier: ${value}`);
}

export function ensureActorContext(ctx: AiActorContext): AiActorContext {
  return {
    ...ctx,
    shopId: assertNonEmpty(ctx.shopId, "shopId"),
    actorId: assertNonEmpty(ctx.actorId, "actorId"),
    source: assertNonEmpty(ctx.source, "source") as AiActorSource,
  };
}

export function fromTable(client: AiServerClient, table: string) {
  return client.from(table as never);
}
