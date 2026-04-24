import type { Json } from "@shared/types/types/supabase";
import {
  type AiActorContext,
  type AiActionEventRecord,
  type AiActionEventType,
  ensureActorContext,
  fromTable,
  normalizeObjectJson,
  type AiServerClient,
} from "./types";

type LogAiActionEventInput = {
  recommendationId?: string | null;
  actionPreviewId?: string | null;
  approvalId?: string | null;
  eventType: AiActionEventType;
  actorRole?: string | null;
  source?: string;
  idempotencyKey?: string | null;
  payload?: Json;
  metadata?: Json;
};

export async function logAiActionEvent(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: LogAiActionEventInput,
): Promise<AiActionEventRecord> {
  const ctx = ensureActorContext(actor);

  const insertPayload = {
    shop_id: ctx.shopId,
    recommendation_id: input.recommendationId ?? null,
    action_preview_id: input.actionPreviewId ?? null,
    approval_id: input.approvalId ?? null,
    event_type: input.eventType,
    actor_id: ctx.actorId,
    actor_role: input.actorRole ?? actor.role ?? null,
    source: input.source ?? ctx.source,
    idempotency_key: input.idempotencyKey ?? null,
    payload: normalizeObjectJson(input.payload),
    metadata: normalizeObjectJson(input.metadata),
  };

  const { data, error } = await fromTable(supabase, "ai_action_events")
    .insert(insertPayload)
    .select("*")
    .single<AiActionEventRecord>();

  if (error) throw new Error(error.message);
  return data;
}

export async function listAiActionEventsForRecommendation(
  supabase: AiServerClient,
  actor: AiActorContext,
  recommendationId: string,
): Promise<AiActionEventRecord[]> {
  const ctx = ensureActorContext(actor);

  const { data, error } = await fromTable(supabase, "ai_action_events")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("recommendation_id", recommendationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AiActionEventRecord[];
}

export async function listAiActionEventsForPreview(
  supabase: AiServerClient,
  actor: AiActorContext,
  actionPreviewId: string,
): Promise<AiActionEventRecord[]> {
  const ctx = ensureActorContext(actor);

  const { data, error } = await fromTable(supabase, "ai_action_events")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("action_preview_id", actionPreviewId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as AiActionEventRecord[];
}
