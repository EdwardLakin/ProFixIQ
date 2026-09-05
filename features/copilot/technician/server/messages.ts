import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";
import { getActorConversationIds } from "@/features/ai/lib/chat/authorization";

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
