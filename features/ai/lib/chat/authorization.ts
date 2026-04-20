import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];

type AccessResult =
  | {
      ok: true;
      conversation: ConversationRow;
      participantUserIds: string[];
    }
  | {
      ok: false;
      status: 403 | 404 | 500;
      error: string;
    };

export async function authorizeConversationActor({
  supabase,
  conversationId,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  actorUserId: string;
}): Promise<AccessResult> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, created_by, context_type, context_id, is_group, title, created_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    return { ok: false, status: 500, error: conversationError.message };
  }

  if (!conversation) {
    return { ok: false, status: 404, error: "Conversation not found" };
  }

  const { data: participantRows, error: participantsError } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);

  if (participantsError) {
    return { ok: false, status: 500, error: participantsError.message };
  }

  const participantUserIds = (participantRows ?? [])
    .map((row) => row.user_id)
    .filter((userId): userId is string => Boolean(userId));

  const isAllowed =
    conversation.created_by === actorUserId ||
    participantUserIds.includes(actorUserId);

  if (!isAllowed) {
    return {
      ok: false,
      status: 403,
      error: "You are not part of this conversation",
    };
  }

  return { ok: true, conversation, participantUserIds };
}

export async function getActorConversationIds({
  supabase,
  actorUserId,
}: {
  supabase: SupabaseClient<Database>;
  actorUserId: string;
}): Promise<{ ids: string[]; error: string | null }> {
  const { data: createdConversations, error: createdError } = await supabase
    .from("conversations")
    .select("id")
    .eq("created_by", actorUserId);

  if (createdError) {
    return { ids: [], error: createdError.message };
  }

  const { data: participantRows, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", actorUserId);

  if (participantError) {
    return { ids: [], error: participantError.message };
  }

  const ids = Array.from(
    new Set([
      ...(createdConversations ?? []).map((row) => row.id),
      ...(participantRows ?? []).map((row) => row.conversation_id),
    ]),
  ).filter((id): id is string => Boolean(id));

  return { ids, error: null };
}
