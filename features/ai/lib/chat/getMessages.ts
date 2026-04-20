import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export async function getMessages({
  supabase,
  conversationId,
}: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
}): Promise<Database["public"]["Tables"]["messages"]["Row"][]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const access = await authorizeConversationActor({
    supabase,
    conversationId,
    actorUserId: user.id,
  });

  if (!access.ok) {
    return [];
  }

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return data ?? [];
}
