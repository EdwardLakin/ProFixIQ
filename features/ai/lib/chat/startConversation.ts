// src/lib/chat/startConversation.ts
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { Database } from "@shared/types/types/supabase";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  // Generate conversation ID
  const conversationId = uuidv4();

  const { error: convoErr } = await supabase
    .from("conversations")
    .insert([
      {
        id: conversationId,
        created_by,
        context_type,
        context_id,
      },
    ]);

  if (convoErr) {
    throw new Error("Failed to start conversation: " + convoErr.message);
  }

  const participants = participant_ids.map((id) => ({
    id: uuidv4(),
    conversation_id: conversationId,
    user_id: id,
  }));

  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert(participants);

  if (participantsError) {
    throw new Error(
      "Failed to add participants: " + participantsError.message,
    );
  }

  return { id: conversationId };
}