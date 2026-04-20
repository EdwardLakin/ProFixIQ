import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getMessages as getMessagesWithAccess } from "@/features/ai/lib/chat/getMessages";
import { sendMessage as sendMessageWithAccess } from "@/features/ai/lib/chat/sendMessage";
import { getUserConversations } from "@/features/ai/lib/chat/getUserConversations";

export async function getMessages(conversationId: string) {
  const supabase = createServerSupabaseRSC();
  return getMessagesWithAccess({ supabase, conversationId });
}

export async function getMyConversations() {
  const supabase = createServerSupabaseRSC();
  return getUserConversations(supabase);
}

export async function sendMessage({
  conversationId,
  content,
  metadata,
}: {
  conversationId: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServerSupabaseRSC();
  return sendMessageWithAccess({
    supabase,
    conversationId,
    content,
    metadata,
  });
}
