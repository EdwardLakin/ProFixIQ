import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Conversation = DB["public"]["Tables"]["conversations"]["Row"];
type Message = DB["public"]["Tables"]["messages"]["Row"];

interface ConversationWithMeta extends Conversation {
  latest_message: Message | null;
  unread_count: number;
}

export async function getUserConversations(
  supabase: SupabaseClient<DB>,
): Promise<ConversationWithMeta[]> {
  // 1) who am I
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return [];

  // 2) conversations I created
  const { data: createdConvos, error: createdErr } = await supabase
    .from("conversations")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (createdErr) {
    console.error("[getUserConversations] created err:", createdErr);
  }

  // 3) conversations I participate in
  const { data: participantRows, error: partErr } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (partErr) {
    console.error("[getUserConversations] participants err:", partErr);
  }

  // 4) merge IDs
  const convoMap = new Map<string, Conversation>();
  (createdConvos ?? []).forEach((c) => convoMap.set(c.id, c));

  const participantIds =
    participantRows?.map((p) => p.conversation_id) ?? [];

  if (participantIds.length) {
    const { data: participantConvos, error: pcErr } = await supabase
      .from("conversations")
      .select("*")
      .in("id", participantIds);

    if (pcErr) {
      console.error("[getUserConversations] participant convos err:", pcErr);
    } else {
      (participantConvos ?? []).forEach((c) => {
        if (!convoMap.has(c.id)) {
          convoMap.set(c.id, c);
        }
      });
    }
  }

  const allConvos = Array.from(convoMap.values());
  if (allConvos.length === 0) return [];

  const convoIds = allConvos.map((c) => c.id);

  // 5) get messages for *all* these convos in one go, newest first
  const { data: allMessages, error: msgErr } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", convoIds)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (msgErr) {
    console.error("[getUserConversations] messages err:", msgErr);
  }

  // pick the latest per conversation
  const latestByConvo = new Map<string, Message>();
  (allMessages ?? []).forEach((m) => {
    if (!latestByConvo.has(m.conversation_id)) {
      latestByConvo.set(m.conversation_id, m);
    }
  });

  // 6) shape result
  const result: ConversationWithMeta[] = allConvos.map((c) => {
    const latest = latestByConvo.get(c.id) ?? null;

    return {
      ...c,
      latest_message: latest,
      // you have a message_reads table, but this helper doesn't join it yet
      // so keep unread_count at 0 to avoid schema mismatches
      unread_count: 0,
    };
  });

  // 7) sort newest first
  result.sort((a, b) => {
    const aTime =
      a.latest_message?.sent_at ??
      a.latest_message?.created_at ??
      a.created_at ??
      "";
    const bTime =
      b.latest_message?.sent_at ??
      b.latest_message?.created_at ??
      b.created_at ??
      "";
    return bTime.localeCompare(aTime);
  });

  return result;
}