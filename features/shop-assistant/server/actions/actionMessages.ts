import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShopAssistantActor } from "@/features/shop-assistant/server/requireShopAssistantActor";
import type {
  ShopAssistantMessage,
  ShopAssistantMessageKind,
} from "@/features/shop-assistant/types";

type AssistantDb = SupabaseClient<any>;

type MessageRow = {
  id: string;
  thread_id: string;
  role: string;
  kind: string;
  content: string;
  payload: unknown;
  client_message_id: string | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapMessage(row: MessageRow): ShopAssistantMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: "assistant",
    kind:
      row.kind === "confirmation" ||
      row.kind === "action_result" ||
      row.kind === "error" ||
      row.kind === "state_update"
        ? row.kind
        : "text",
    content: row.content,
    payload: asRecord(row.payload),
    clientMessageId: row.client_message_id,
    createdAt: row.created_at,
  };
}

const MESSAGE_SELECT =
  "id, thread_id, role, kind, content, payload, client_message_id, created_at";

export async function findOrCreateActionMessage(params: {
  actor: ShopAssistantActor;
  threadId: string;
  actionId: string;
  kind: ShopAssistantMessageKind;
  content: string;
  payload: Record<string, unknown>;
}): Promise<ShopAssistantMessage> {
  const clientMessageId = `shop-action:${params.actionId}:${params.kind}`;
  const db = params.actor.supabase as unknown as AssistantDb;
  const insert = {
    thread_id: params.threadId,
    shop_id: params.actor.shopId,
    user_id: null,
    role: "assistant",
    kind: params.kind,
    content: params.content,
    payload: {
      ...params.payload,
      actionId: params.actionId,
    },
    client_message_id: clientMessageId,
  };

  const { data, error } = await db
    .from("shop_assistant_messages")
    .insert(insert)
    .select(MESSAGE_SELECT)
    .maybeSingle();
  if (!error && data) return mapMessage(data as MessageRow);
  if (error?.code !== "23505") {
    throw new Error(error?.message ?? "Failed to save action result message.");
  }

  const { data: existing, error: existingError } = await db
    .from("shop_assistant_messages")
    .select(MESSAGE_SELECT)
    .eq("thread_id", params.threadId)
    .eq("client_message_id", clientMessageId)
    .maybeSingle();
  if (existingError || !existing) {
    throw new Error(
      existingError?.message ?? "Failed to restore action result message.",
    );
  }
  return mapMessage(existing as MessageRow);
}
