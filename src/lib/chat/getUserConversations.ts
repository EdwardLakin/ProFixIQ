import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];

interface ConversationWithMeta extends Conversation {
  latest_message?: Message | null;
  unread_count: number;
}

export async function getUserConversations(
  supabase: SupabaseClient<Database>
): Promise<ConversationWithMeta[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return [];

  const { data: participants } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id);

  const conversationIds = participants?.map((p) => p.conversation_id) || [];

  if (conversationIds.length === 0) return [];

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .in('id', conversationIds);

  const messagesMap: Record<string, { latest: Message | null; unread: number }> = {};

  for (const convoId of conversationIds) {
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('sent_at', { ascending: false })
      .limit(20); // small batch for perf

    const latest = messages?.[0] || null;
    const unread = messages?.filter((m) => !(m.read_by || []).includes(user.id)).length || 0;
    messagesMap[convoId] = { latest, unread };
  }

  return (conversations || []).map((c) => ({
    ...c,
    latest_message: messagesMap[c.id]?.latest || null,
    unread_count: messagesMap[c.id]?.unread || 0,
  }));
}