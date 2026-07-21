import { createHash, randomUUID } from "node:crypto";
import type { Json } from "@shared/types/types/supabase";
import type {
  AssistantActionRisk,
  AssistantConversationMessage,
  AssistantPendingAction,
} from "@/features/agent/assistant/types";
import type {
  AssistantActionRequestRow,
  AssistantConversationRow,
  AssistantMessageRow,
  ShopAssistantSupabaseClient,
} from "./shopAssistantDatabase";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistedConversationMessage = AssistantConversationMessage & {
  id: string;
  createdAt: string;
};

export function stableHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function asJson(value: Record<string, unknown> | undefined): Json {
  return (value ?? {}) as Json;
}

function defaultConversationTitle(question?: string): string | null {
  const normalized = question?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export async function ensureAssistantConversation(
  client: ShopAssistantSupabaseClient,
  params: {
    conversationId?: string;
    shopId: string;
    userId: string;
    context?: Record<string, unknown>;
    firstQuestion?: string;
  },
): Promise<AssistantConversationRow> {
  if (isUuid(params.conversationId)) {
    const { data: existing, error } = await client
      .from("assistant_conversations")
      .select("*")
      .eq("id", params.conversationId)
      .eq("shop_id", params.shopId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (existing) {
      const nextContext = asJson(params.context);
      const { data: updated, error: updateError } = await client
        .from("assistant_conversations")
        .update({ context: nextContext, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("shop_id", params.shopId)
        .eq("user_id", params.userId)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);
      return updated;
    }
  }

  const { data, error } = await client
    .from("assistant_conversations")
    .insert({
      id: randomUUID(),
      shop_id: params.shopId,
      user_id: params.userId,
      title: defaultConversationTitle(params.firstQuestion),
      context: asJson(params.context),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function loadAssistantConversation(
  client: ShopAssistantSupabaseClient,
  params: { conversationId: string; shopId: string; userId: string },
): Promise<AssistantConversationRow | null> {
  if (!isUuid(params.conversationId)) return null;

  const { data, error } = await client
    .from("assistant_conversations")
    .select("*")
    .eq("id", params.conversationId)
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAssistantConversationState(
  client: ShopAssistantSupabaseClient,
  params: {
    conversationId: string;
    shopId: string;
    userId: string;
    context?: Record<string, unknown>;
    lastIntent?: string;
  },
): Promise<void> {
  const { error } = await client
    .from("assistant_conversations")
    .update({
      context: asJson(params.context),
      last_intent: params.lastIntent ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.conversationId)
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId);

  if (error) throw new Error(error.message);
}

export async function appendAssistantMessage(
  client: ShopAssistantSupabaseClient,
  params: {
    conversationId: string;
    shopId: string;
    userId: string;
    role: "user" | "assistant";
    content: string;
    requestId: string;
    payload?: Record<string, unknown>;
  },
): Promise<AssistantMessageRow> {
  const content = params.content.replace(/\s+$/g, "").trim();
  if (!content) throw new Error("Assistant message content is required");

  const messageKey = stableHash(
    params.conversationId,
    params.role,
    params.requestId,
  );

  const { data, error } = await client
    .from("assistant_messages")
    .upsert(
      {
        conversation_id: params.conversationId,
        shop_id: params.shopId,
        user_id: params.userId,
        role: params.role,
        content,
        payload: asJson(params.payload),
        message_key: messageKey,
      },
      {
        onConflict: "conversation_id,message_key",
        ignoreDuplicates: true,
      },
    )
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: existing, error: existingError } = await client
    .from("assistant_messages")
    .select("*")
    .eq("conversation_id", params.conversationId)
    .eq("message_key", messageKey)
    .single();

  if (existingError) throw new Error(existingError.message);
  return existing;
}

export async function listAssistantMessages(
  client: ShopAssistantSupabaseClient,
  params: {
    conversationId: string;
    shopId: string;
    userId: string;
    limit?: number;
  },
): Promise<PersistedConversationMessage[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 40, 80));
  const { data, error } = await client
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", params.conversationId)
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    }));
}

export async function deleteAssistantConversation(
  client: ShopAssistantSupabaseClient,
  params: { conversationId: string; shopId: string; userId: string },
): Promise<boolean> {
  if (!isUuid(params.conversationId)) return false;

  const { data, error } = await client
    .from("assistant_conversations")
    .delete()
    .eq("id", params.conversationId)
    .eq("shop_id", params.shopId)
    .eq("user_id", params.userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function createAssistantActionRequest(
  client: ShopAssistantSupabaseClient,
  params: {
    conversationId: string;
    shopId: string;
    userId: string;
    toolName: string;
    domain: string;
    label: string;
    summary: string;
    riskLevel: AssistantActionRisk;
    input: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<AssistantActionRequestRow> {
  const { data, error } = await client
    .from("assistant_action_requests")
    .upsert(
      {
        conversation_id: params.conversationId,
        shop_id: params.shopId,
        requested_by: params.userId,
        tool_name: params.toolName,
        domain: params.domain,
        label: params.label,
        summary: params.summary,
        risk_level: params.riskLevel,
        input: asJson(params.input),
        idempotency_key: params.idempotencyKey,
      },
      { onConflict: "shop_id,idempotency_key", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: existing, error: existingError } = await client
    .from("assistant_action_requests")
    .select("*")
    .eq("shop_id", params.shopId)
    .eq("idempotency_key", params.idempotencyKey)
    .single();

  if (existingError) throw new Error(existingError.message);
  return existing;
}

export async function loadAssistantActionRequest(
  client: ShopAssistantSupabaseClient,
  params: { actionId: string; shopId: string; userId: string },
): Promise<AssistantActionRequestRow | null> {
  if (!isUuid(params.actionId)) return null;

  const { data, error } = await client
    .from("assistant_action_requests")
    .select("*")
    .eq("id", params.actionId)
    .eq("shop_id", params.shopId)
    .eq("requested_by", params.userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAssistantActionRequest(
  client: ShopAssistantSupabaseClient,
  params: {
    actionId: string;
    shopId: string;
    userId: string;
    expectedStatus?: AssistantActionRequestRow["status"];
    patch: Partial<
      Pick<
        AssistantActionRequestRow,
        | "status"
        | "confirmed_by"
        | "confirmed_at"
        | "executed_at"
        | "result"
        | "error_message"
        | "expires_at"
      >
    >;
  },
): Promise<AssistantActionRequestRow | null> {
  let query = client
    .from("assistant_action_requests")
    .update({ ...params.patch, updated_at: new Date().toISOString() })
    .eq("id", params.actionId)
    .eq("shop_id", params.shopId)
    .eq("requested_by", params.userId);

  if (params.expectedStatus) {
    query = query.eq("status", params.expectedStatus);
  }

  const { data, error } = await query.select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export function toPendingAssistantAction(
  row: AssistantActionRequestRow,
): AssistantPendingAction {
  return {
    id: row.id,
    toolName: row.tool_name,
    domain: row.domain,
    label: row.label,
    summary: row.summary,
    riskLevel: row.risk_level,
    status: "pending_confirmation",
    expiresAt: row.expires_at,
    input: (row.input ?? {}) as Record<string, unknown>,
  };
}
