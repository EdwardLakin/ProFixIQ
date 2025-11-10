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

export async function GET(): Promise<NextResponse> {
  // 1. who is calling?
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  // 2. conversations where I'm a participant
  const {
    data: participantRows,
    error: participantErr,
  } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (participantErr) {
    return NextResponse.json(
      { error: participantErr.message },
      { status: 500 },
    );
  }

  // 3. conversations I created
  const {
    data: createdRows,
    error: createdErr,
  } = await admin
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

  (createdRows ?? []).forEach((row: { id: string }) => {
    if (row.id) idSet.add(row.id);
  });

  const conversationIds = Array.from(idSet);

  if (conversationIds.length === 0) {
    return NextResponse.json<ConversationPayload[]>([]);
  }

  // 4. fetch all those conversations
  const {
    data: conversations,
    error: convErr,
  } = await admin
    .from("conversations")
    .select("*")
    .in("id", conversationIds);

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const safeConversations: ConversationRow[] = conversations ?? [];

  // 5. fetch messages for those conversations
  //    we pull by conversation_id and also by chat_id (legacy)
  const {
    data: messagesByConversation,
    error: messagesConvErr,
  } = await admin
    .from("messages")
    .select("*")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (messagesConvErr) {
    return NextResponse.json(
      { error: messagesConvErr.message },
      { status: 500 },
    );
  }

  const {
    data: messagesByChat,
    error: messagesChatErr,
  } = await admin
    .from("messages")
    .select("*")
    .in("chat_id", conversationIds)
    .order("created_at", { ascending: false });

  if (messagesChatErr) {
    return NextResponse.json(
      { error: messagesChatErr.message },
      { status: 500 },
    );
  }

  // merge both arrays
  const allMessages: MessageRow[] = [
    ...(messagesByConversation ?? []),
    ...(messagesByChat ?? []),
  ];

  // pick latest per conversation
  const latestByConv = new Map<string, MessageRow>();

  for (const msg of allMessages) {
    const convId =
      (msg.conversation_id && conversationIds.includes(msg.conversation_id)
        ? msg.conversation_id
        : null) ||
      (msg.chat_id && conversationIds.includes(msg.chat_id)
        ? msg.chat_id
        : null);

    if (!convId) continue;
    if (!latestByConv.has(convId)) {
      // arrays already ordered DESC
      latestByConv.set(convId, msg);
    }
  }

  const payload: ConversationPayload[] = safeConversations.map(
    (conv: ConversationRow): ConversationPayload => {
      const latest = latestByConv.get(conv.id) ?? null;
      return {
        conversation: conv,
        latest_message: latest,
        // no read receipts yet
        unread_count: 0,
      };
    },
  );

  return NextResponse.json<ConversationPayload[]>(payload);
}