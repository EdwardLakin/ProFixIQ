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
  // 1) who is calling
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) use admin to bypass RLS timing issues
  const admin = createAdminSupabase();

  // 2a) conversations I created
  const {
    data: createdConvos,
    error: createdErr,
  } = await admin
    .from("conversations")
    .select("*")
    .eq("created_by", user.id);

  if (createdErr) {
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  // 2b) conversations I'm a participant in
  const {
    data: participantRows,
    error: partsErr,
  } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (partsErr) {
    return NextResponse.json({ error: partsErr.message }, { status: 500 });
  }

  // collect unique convo ids
  const convoIdSet = new Set<string>();
  (createdConvos ?? []).forEach((c) => {
    if (c.id) convoIdSet.add(c.id);
  });
  (participantRows ?? []).forEach((p) => {
    if (p.conversation_id) convoIdSet.add(p.conversation_id);
  });

  const convoIds = Array.from(convoIdSet);
  if (convoIds.length === 0) {
    // user has no conversations
    return NextResponse.json<ConversationPayload[]>([], { status: 200 });
  }

  // 3) load all those conversations explicitly
  const {
    data: allConvos,
    error: allConvosErr,
  } = await admin
    .from("conversations")
    .select("*")
    .in("id", convoIds);

  if (allConvosErr) {
    return NextResponse.json({ error: allConvosErr.message }, { status: 500 });
  }
  const safeConvos: ConversationRow[] = allConvos ?? [];

  // 4) load messages for those conversations
  // we support BOTH new (conversation_id) and legacy (chat_id) columns
  const {
    data: allMessages,
    error: msgErr,
  } = await admin
    .from("messages")
    .select("*")
    .or(
      `conversation_id.in.(${convoIds.join(
        ",",
      )}),chat_id.in.(${convoIds.join(",")})`,
    )
    .order("created_at", { ascending: false });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // pick latest message per conversation id
  const latestByConvo = new Map<string, MessageRow>();
  (allMessages ?? []).forEach((m) => {
    // prefer conversation_id, fallback to chat_id
    const cid =
      m.conversation_id && convoIdSet.has(m.conversation_id)
        ? m.conversation_id
        : m.chat_id && convoIdSet.has(m.chat_id)
          ? m.chat_id
          : null;
    if (!cid) return;
    if (!latestByConvo.has(cid)) {
      latestByConvo.set(cid, m);
    }
  });

  // 5) load participants for those convos
  const {
    data: allParticipants,
    error: allPartsErr,
  } = await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convoIds);

  if (allPartsErr) {
    return NextResponse.json({ error: allPartsErr.message }, { status: 500 });
  }

  // 6) collect all user ids we need names for (all participants + all creators)
  const userIdSet = new Set<string>();
  (allParticipants ?? []).forEach((p) => {
    if (p.user_id) userIdSet.add(p.user_id);
  });
  safeConvos.forEach((c) => {
    if (c.created_by) userIdSet.add(c.created_by);
  });

  const allUserIds = Array.from(userIdSet);

  // fetch profiles by *either* id or user_id and map by both keys
  let profileMap = new Map<string, { id: string; full_name: string | null }>();
  if (allUserIds.length > 0) {
    const {
      data: profiles,
      error: profErr,
    } = await admin
      .from("profiles")
      .select("id, user_id, full_name")
      .or(
        `id.in.(${allUserIds.join(",")}),user_id.in.(${allUserIds.join(",")})`,
      );

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const p of profiles ?? []) {
      const label = { id: p.user_id ?? p.id, full_name: p.full_name ?? null };
      if (p.id) profileMap.set(p.id, label);
      if (p.user_id) profileMap.set(p.user_id, label); // ← critical
    }
  }

  // 7) build participants list per convo AND make sure the creator is included
  const participantsByConvo = new Map<string, ParticipantInfo[]>();
  (allParticipants ?? []).forEach((p) => {
    if (!p.conversation_id || !p.user_id) return;
    const arr = participantsByConvo.get(p.conversation_id) ?? [];
    const prof = profileMap.get(p.user_id);
    arr.push({
      id: p.user_id,
      full_name: prof ? prof.full_name : null,
    });
    participantsByConvo.set(p.conversation_id, arr);
  });

  // add creator to participant list if missing
  safeConvos.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    if (!arr.find((p) => p.id === c.created_by)) {
      const prof = profileMap.get(c.created_by);
      arr.push({
        id: c.created_by,
        full_name: prof ? prof.full_name : null,
      });
    }
    participantsByConvo.set(c.id, arr);
  });

  // 8) build payload
  const payload: ConversationPayload[] = safeConvos.map((c) => {
    const latest = latestByConvo.get(c.id) ?? null;
    const parts = participantsByConvo.get(c.id) ?? [];
    return {
      conversation: c,
      latest_message: latest,
      participants: parts,
      unread_count: 0, // you can calculate later from message_reads
    };
  });

  // newest first in the response
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

  return NextResponse.json(payload, { status: 200 });
}