import "server-only";

import type { Json } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  type AiActorContext,
  type AiActionEventRecord,
  ensureActorContext,
  fromTable,
  normalizeObjectJson,
  type AiServerClient,
} from "./types";
import { assertAiActionEventType, type AiActionEventType } from "./eventTypes";

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEventActor(ctx: AiActorContext, source: string, metadata: Json): {
  actorId: string | null;
  metadata: Json;
} {
  if (UUID_PATTERN.test(ctx.actorId)) {
    return { actorId: ctx.actorId, metadata };
  }

  if (source !== "system") {
    throw new Error("AI action event actorId must be a profile UUID");
  }

  return {
    actorId: null,
    metadata: {
      ...(normalizeObjectJson(metadata) as Record<string, Json>),
      system_actor_id: ctx.actorId,
    },
  };
}

export async function logAiActionEvent(
  _supabase: AiServerClient,
  actor: AiActorContext,
  input: LogAiActionEventInput,
): Promise<AiActionEventRecord> {
  const ctx = ensureActorContext(actor);
  const eventType = assertAiActionEventType(input.eventType);
  const source = input.source ?? ctx.source;
  const normalizedActor = normalizeEventActor(ctx, source, normalizeObjectJson(input.metadata));

  const insertPayload = {
    shop_id: ctx.shopId,
    recommendation_id: input.recommendationId ?? null,
    action_preview_id: input.actionPreviewId ?? null,
    approval_id: input.approvalId ?? null,
    event_type: eventType,
    actor_id: normalizedActor.actorId,
    actor_role: input.actorRole ?? actor.role ?? null,
    source,
    idempotency_key: input.idempotencyKey ?? null,
    payload: normalizeObjectJson(input.payload),
    metadata: normalizedActor.metadata,
  };

  // Audit events are a trusted server-side append. The browser role has no
  // direct INSERT privilege on this table.
  const { data, error } = await fromTable(createAdminSupabase(), "ai_action_events")
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
