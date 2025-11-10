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
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

type ParticipantInfo = {
  id: string;
  full_name: string | null;
};

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: ParticipantInfo[];
  unread_count: number;
};

export async function GET(): Promise<NextResponse> {
  // get the caller
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // use admin to dodge RLS 500s
  const admin = createAdminSupabase();

  // 1) conversations where I'm a participant
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

  // 2) conversations I created
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

  // collect all convo ids
  const idSet = new Set<string>();
  (participantRows ?? []).forEach((row) => {
    if (row.conversation_id) {
      idSet.add(row.conversation_id);
    }
  });
  (createdRows ?? []).forEach((row) => {
    if (row.id) {
      idSet.add(row.id);
    }
  });

  const conversationIds = Array.from(idSet);
  if (conversationIds.length === 0) {
    return NextResponse.json<ConversationPayload[]>([]);
  }

  // 3) fetch those conversations
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

  // 4) fetch messages for those convos (new schema)
  const {
    data: messagesByConversation,
    error: msgConvErr,
  } = await admin
    .from("messages")
    .select("*")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  if (msgConvErr) {
    return NextResponse.json({ error: msgConvErr.message }, { status: 500 });
  }

  // 5) fetch messages for legacy chat_id
  const {
    data: messagesByChat,
    error: msgChatErr,
  } = await admin
    .from("messages")
    .select("*")
    .in("chat_id", conversationIds)
    .order("created_at", { ascending: false });

  if (msgChatErr) {
    return NextResponse.json({ error: msgChatErr.message }, { status: 500 });
  }

  const allMessages: MessageRow[] = [
    ...(messagesByConversation ?? []),
    ...(messagesByChat ?? []),
  ];

  // 6) fetch participants for those convos
  const {
    data: convoParticipants,
    error: convPartErr,
  } = await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds);

  if (convPartErr) {
    return NextResponse.json({ error: convPartErr.message }, { status: 500 });
  }

  // 7) collect user ids so we can show names
  const userIdSet = new Set<string>();
  (convoParticipants ?? []).forEach((row) => {
    if (row.user_id) {
      userIdSet.add(row.user_id);
    }
  });
  safeConversations.forEach((c) => {
    if (c.created_by) {
      userIdSet.add(c.created_by);
    }
  });

  const allUserIds = Array.from(userIdSet);

  // we only need id + full_name, so select just those
  const {
    data: profiles,
    error: profErr,
  } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", allUserIds);

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  // the rows we selected are NOT full ProfileRow,
  // so type the map to match exactly what we selected
  type MinimalProfile = Pick<ProfileRow, "id" | "full_name">;
  const profileMap = new Map<string, MinimalProfile>();
  (profiles ?? []).forEach((p) => {
    // p has id + full_name because of the select above
    profileMap.set(p.id, {
      id: p.id,
      full_name: p.full_name,
    });
  });

  // 8) pick latest message per convo
  const latestByConvo = new Map<string, MessageRow>();
  for (const msg of allMessages) {
    const convId =
      (msg.conversation_id &&
        conversationIds.includes(msg.conversation_id) &&
        msg.conversation_id) ||
      (msg.chat_id && conversationIds.includes(msg.chat_id)
        ? msg.chat_id
        : null);

    if (!convId) continue;
    // messages are ordered desc, so first one wins
    if (!latestByConvo.has(convId)) {
      latestByConvo.set(convId, msg);
    }
  }

  // 9) build participant list per convo
  const participantsByConvo = new Map<string, ParticipantInfo[]>();
  (convoParticipants ?? []).forEach((row) => {
    if (!row.conversation_id || !row.user_id) return;
    const arr = participantsByConvo.get(row.conversation_id) ?? [];
    const prof = profileMap.get(row.user_id);
    arr.push({
      id: row.user_id,
      full_name: prof ? prof.full_name : null,
    });
    participantsByConvo.set(row.conversation_id, arr);
  });

  // also add the creator to the participants list
  safeConversations.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    const already = arr.find((p) => p.id === c.created_by);
    if (!already) {
      const prof = profileMap.get(c.created_by);
      arr.push({
        id: c.created_by,
        full_name: prof ? prof.full_name : null,
      });
    }
    participantsByConvo.set(c.id, arr);
  });

  // 10) build payload
  const payload: ConversationPayload[] = safeConversations.map((conv) => {
    const latest = latestByConvo.get(conv.id) ?? null;
    const parts = participantsByConvo.get(conv.id) ?? [];
    return {
      conversation: conv,
      latest_message: latest,
      participants: parts,
      unread_count: 0,
    };
  });

  // newest first
  payload.sort((a, b) => {
    const at =
      a.latest_message?.created_at ??
      a.latest_message?.sent_at ??
      a.conversation.created_at ??
      "";
    const bt =
      b.latest_message?.created_at ??
      b.latest_message?.sent_at ??
      b.conversation.created_at ??
      "";
    return bt.localeCompare(at);
  });

  return NextResponse.json<ConversationPayload[]>(payload);
}