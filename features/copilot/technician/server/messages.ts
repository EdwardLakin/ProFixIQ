import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import {
  authorizeConversationActor,
  getActorConversationIds,
} from "@/features/ai/lib/chat/authorization";

const MAX_CONVERSATIONS = 50;

export type TechnicianConversationDigestItem = {
  conversationId: string;
  title: string | null;
  workOrderId: string | null;
  latestMessageId: string;
  latestMessagePreview: string;
  latestMessageAt: string;
  /** True when the technician's own account sent the latest message — never
   * worth announcing as "a new message arrived" back at them. */
  fromTechnician: boolean;
};

function preview(content: string, maxLength = 160): string {
  const trimmed = content.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
    : trimmed;
}

/**
 * The technician's conversations with their latest message, for noticing a
 * new incoming message the same way buildTechnicianDayAgenda notices a new
 * assignment. Reuses the same participant-authorization and latest-message
 * reduction the existing chat inbox already relies on
 * (getActorConversationIds, getUserConversations) rather than inventing a
 * parallel messaging authorization model.
 */
export async function listTechnicianConversationDigest(input: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  actorUserId: string;
}): Promise<TechnicianConversationDigestItem[]> {
  const { ids: conversationIds, error: idsError } =
    await getActorConversationIds({
      supabase: input.supabase,
      actorUserId: input.actorUserId,
    });
  if (idsError || conversationIds.length === 0) return [];

  const { data: conversations, error: conversationsError } = await input.supabase
    .from("conversations")
    .select("id,title,work_order_id,shop_id")
    .in("id", conversationIds)
    .eq("shop_id", input.shopId)
    .is("archived_at", null)
    .limit(MAX_CONVERSATIONS);
  if (conversationsError || !conversations?.length) return [];

  const scopedIds = conversations.map((conversation) => conversation.id);
  const { data: messages, error: messagesError } = await input.supabase
    .from("messages")
    .select("id,conversation_id,content,sender_id,sent_at,created_at")
    .in("conversation_id", scopedIds)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false });
  if (messagesError) return [];

  const latestByConversation = new Map<
    string,
    { id: string; content: string; senderId: string | null; at: string }
  >();
  for (const message of messages ?? []) {
    const conversationId = message.conversation_id;
    if (!conversationId || latestByConversation.has(conversationId)) continue;
    latestByConversation.set(conversationId, {
      id: message.id,
      content: message.content,
      senderId: message.sender_id,
      at: message.sent_at ?? message.created_at,
    });
  }

  const items: TechnicianConversationDigestItem[] = [];
  for (const conversation of conversations) {
    const latest = latestByConversation.get(conversation.id);
    if (!latest) continue;
    items.push({
      conversationId: conversation.id,
      title: conversation.title,
      workOrderId: conversation.work_order_id,
      latestMessageId: latest.id,
      latestMessagePreview: preview(latest.content),
      latestMessageAt: latest.at,
      fromTechnician: latest.senderId === input.actorUserId,
    });
  }

  items.sort((left, right) => right.latestMessageAt.localeCompare(left.latestMessageAt));
  return items;
}

export type SendTechnicianCopilotMessageResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; status: number; error: string };

/**
 * Sends a technician's spoken/typed reply into an existing conversation.
 * Mirrors sendMessage()'s core logic (features/ai/lib/chat/sendMessage.ts)
 * but takes the actor id explicitly instead of deriving it from
 * supabase.auth.getUser() - the CoPilot always calls through the admin
 * client, which has no session to derive from - and reuses the exact same
 * authorizeConversationActor participant check that function already
 * relies on, so a technician can only ever reply into a conversation
 * they're really part of, independent of anything the model claims.
 *
 * clientMessageId should be the turn's turnId: idempotency here is a
 * best-effort check-before-insert (messages.client_message_id has no
 * unique constraint to enforce it atomically), which matches the
 * idempotency the existing manual chat send already has - none - rather
 * than a new, unenforceable guarantee.
 */
export async function sendTechnicianCopilotMessage(input: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
  conversationId: string;
  content: string;
  clientMessageId: string;
}): Promise<SendTechnicianCopilotMessageResult> {
  const access = await authorizeConversationActor({
    supabase: input.supabase,
    conversationId: input.conversationId,
    actorUserId: input.actorUserId,
  });
  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }

  const { data: existing, error: existingError } = await input.supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("client_message_id", input.clientMessageId)
    .maybeSingle();
  if (existingError) {
    return { ok: false, status: 500, error: existingError.message };
  }
  if (existing) {
    return { ok: true, idempotent: true };
  }

  const recipients = access.participantUserIds.filter(
    (userId) => userId !== input.actorUserId,
  );
  const { error: insertError } = await input.supabase.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.actorUserId,
    client_message_id: input.clientMessageId,
    recipients,
    content: input.content,
    sent_at: new Date().toISOString(),
    attachments: [],
    metadata: { source: "technician_copilot" },
  });
  if (insertError) {
    return { ok: false, status: 500, error: insertError.message };
  }

  return { ok: true, idempotent: false };
}
