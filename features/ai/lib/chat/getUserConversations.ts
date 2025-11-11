import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

interface ConversationWithMeta extends Conversation {
  latest_message?: Message | null;
  unread_count: number;
}

export async function getUserConversations(
  supabase: SupabaseClient<Database>,
): Promise<ConversationWithMeta[]> {
  // 1) who am I
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  const myId = user.id;

  // 2) conversations where I'm a participant
  const { data: participantRows, error: participantErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", myId);

  if (participantErr) {
    console.error("[getUserConversations] participants error:", participantErr);
  }

  const participantIds =
    participantRows?.map((row) => row.conversation_id).filter(Boolean) ?? [];

  // 3) conversations I created
  const { data: createdRows, error: createdErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("created_by", myId);

  if (createdErr) {
    console.error("[getUserConversations] created error:", createdErr);
  }

  const createdIds = createdRows?.map((row) => row.id).filter(Boolean) ?? [];

  // 4) union → final list of convo IDs
  const allConvoIds = Array.from(
    new Set<string>([...participantIds, ...createdIds]),
  );

  if (allConvoIds.length === 0) {
    return [];
  }

  // 5) fetch those conversations
  const { data: conversations, error: convErr } = await supabase
    .from("conversations")
    .select("*")
    .in("id", allConvoIds);

  if (convErr) {
    console.error("[getUserConversations] conversations error:", convErr);
    return [];
  }

  const safeConversations: Conversation[] = conversations ?? [];

  // 6) fetch ALL messages for those convos in one query (new schema)
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", allConvoIds)
    .order("sent_at", { ascending: false });

  if (msgErr) {
    console.error("[getUserConversations] messages error:", msgErr);
  }

  const allMessages: Message[] = messages ?? [];

  // 7) pick the latest message per conversation
  const latestByConvo = new Map<string, Message>();
  for (const m of allMessages) {
    const cid = m.conversation_id;
    if (!cid) continue;
    // messages are ordered DESC by sent_at, so first one we see is the latest
    if (!latestByConvo.has(cid)) {
      latestByConvo.set(cid, m);
    }
  }

  // 8) build final list
  const result: ConversationWithMeta[] = safeConversations.map((conv) => {
    const latest = latestByConvo.get(conv.id) ?? null;

    // you don't have message_reads wired yet, so keep unread_count = 0 for now
    return {
      ...conv,
      latest_message: latest,
      unread_count: 0,
    };
  });

  // 9) sort newest-first
  result.sort((a, b) => {
    const at =
      a.latest_message?.sent_at ??
      a.latest_message?.created_at ??
      a.created_at ??
      "";
    const bt =
      b.latest_message?.sent_at ??
      b.latest_message?.created_at ??
      b.created_at ??
      "";
    return bt.localeCompare(at);
  });

  return result;
}