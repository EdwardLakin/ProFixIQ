import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type Conversation = Database['public']['Tables']['conversations']['Row'];

/**
 * Fetches all conversations the current user is a participant in.
 */
export async function getUserConversations(
  supabase: SupabaseClient<Database>
): Promise<Conversation[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not found:', userError?.message);
    return [];
  }

  const { data: participants, error: participantError } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id);

  if (participantError || !participants) {
    console.error('Error fetching participant links:', participantError?.message);
    return [];
  }

  const conversationIds = participants.map((p) => p.conversation_id);

  if (conversationIds.length === 0) return [];

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .in('id', conversationIds);

  if (error) {
    console.error('Failed to fetch conversations:', error.message);
    return [];
  }

  return conversations ?? [];
}