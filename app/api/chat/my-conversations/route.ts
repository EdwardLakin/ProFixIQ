// app/api/chat/my-conversations/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

export const dynamic = "force-dynamic";

type DB = Database;
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ParticipantRow =
  DB["public"]["Tables"]["conversation_participants"]["Row"];

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  unread_count: number;
};

// helper: some projects still have messages.chat_id
function getMessageConversationId(
  msg: MessageRow,
): string | null {
  // widen the type just enough to check for both
  const maybeConversation = (msg as MessageRow & {
    conversation_id?: string | null;
    chat_id?: string | null;
  });

  if (maybeConversation.conversation_id) {
    return maybeConversation.conversation_id;
  }
  if (maybeConversation.chat_id) {
    return maybeConversation.chat_id;
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  // 1) conversations where I am a participant
  const {
    data: participantRows,
    error: participantErr,
  } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (participantErr) {
    return NextResponse.json(
      { error: participantErr.message },
      { status: 500 },
    );
  }

  // 2) conversations I created
  const {
    data: createdRows,
    error: createdErr,
  } = await supabase
    .from("conversations")
    .select("id")
    .eq("created_by", user.id);

  if (createdErr) {
    return NextResponse.json(
      { error: createdErr.message },
      { status: 500 },
    );
  }

  const idSet = new Set<string>();

  (participantRows ?? []).forEach(
    (row: Pick<ParticipantRow, "conversation_id">) => {
      if (row.conversation_id) idSet.add(row.conversation_id);
    },
  );

  (createdRows ?? []).forEach((row: Pick<ConversationRow, "id">) => {
    if (row.id) idSet.add(row.id);
  });

  const conversationIds = Array.from(idSet);

  if (conversationIds.length === 0) {
    return NextResponse.json<ConversationPayload[]>([]);
  }

  // admin client to dodge RLS 500s
  const admin = createAdminSupabase();

  // 3) fetch those conversations
  const {
    data: conversations,
    error: convErr,
  } = await admin
    .from("conversations")
    .select("*")
    .in("id", conversationIds);

  if (convErr) {
    return NextResponse.json(
      { error: convErr.message },
      { status: 500 },
    );
  }

  const safeConversations: ConversationRow[] = conversations ?? [];

  // 4) fetch messages that belong to those conversations
  const {
    data: allMessages,
    error: msgErr,
  } = await admin
    .from("messages")
    .select("*")
    // we can’t `.in()` on conversation_id AND chat_id at once,
    // so we’ll just pull a reasonably large slice and filter in JS
    .order("created_at", { ascending: false })
    .limit(500);

  if (msgErr) {
    return NextResponse.json(
      { error: msgErr.message },
      { status: 500 },
    );
  }

  const messagesByConvo = new Map<string, MessageRow>();

  (allMessages ?? []).forEach((m: MessageRow) => {
    const convId = getMessageConversationId(m);
    if (!convId) return;
    if (!conversationIds.includes(convId)) return;
    // first one we see is newest because of the order above
    if (!messagesByConvo.has(convId)) {
      messagesByConvo.set(convId, m);
    }
  });

  const payload: ConversationPayload[] = safeConversations.map(
    (conv: ConversationRow): ConversationPayload => {
      const latest = messagesByConvo.get(conv.id) ?? null;
      return {
        conversation: conv,
        latest_message: latest,
        unread_count: 0,
      };
    },
  );

  return NextResponse.json<ConversationPayload[]>(payload);
}