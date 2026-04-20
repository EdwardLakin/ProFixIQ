import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { authorizeConversationActor } from "@/features/ai/lib/chat/authorization";

export const dynamic = "force-dynamic";

export async function sendMessage({
  supabase,
  conversationId,
  content,
  metadata,
}: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return {
      ok: false,
      status: 400,
      error: "conversationId and content are required",
    };
  }

  const access = await authorizeConversationActor({
    supabase,
    conversationId,
    actorUserId: user.id,
  });

  if (!access.ok) {
    return { ok: false, status: access.status, error: access.error };
  }

  const recipients = access.participantUserIds.filter((id) => id !== user.id);

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    recipients,
    content: trimmedContent,
    sent_at: new Date().toISOString(),
    attachments: [],
    metadata: metadata ?? {},
  });

  if (insertError) {
    return { ok: false, status: 500, error: insertError.message };
  }

  return { ok: true };
}
