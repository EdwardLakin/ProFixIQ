// lib/chat/startConversation.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function startConversation({
  created_by,
  participant_ids,
  context_type,
  context_id,
}: {
  created_by: string;
  participant_ids: string[];
  context_type?: string;
  context_id?: string;
}) {
  const { data: conversation, error: convoErr } = await supabase
    .from('conversations')
    .insert([
      {
        created_by,
        context_type,
        context_id,
      },
    ])
    .select()
    .single();

  if (convoErr || !conversation) {
    throw new Error('Failed to start conversation: ' + convoErr?.message);
  }

  const participants = participant_ids.map((id) => ({
    conversation_id: conversation.id,
    user_id: id,
  }));

  const { error: participantsError } = await supabase
    .from('conversation_participants')
    .insert(participants);

  if (participantsError) {
    throw new Error('Failed to add participants: ' + participantsError.message);
  }

  return conversation;
}