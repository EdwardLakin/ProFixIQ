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
type ParticipantRow = DB["public"]["Tables"]["conversation_participants"]["Row"];
type MessageReadRow = DB["public"]["Tables"]["message_reads"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

interface ParticipantInfo {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface ConversationPayload {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: ParticipantInfo[];
  unread_count: number;
}

export async function GET(): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  const { data: createdConvos, error: createdErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id, is_group, title")
    .eq("created_by", user.id);

  if (createdErr) {
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  const { data: partRows, error: partsErr } = await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .eq("user_id", user.id);

  if (partsErr) {
    return NextResponse.json({ error: partsErr.message }, { status: 500 });
  }

  const convoIds = Array.from(
    new Set([
      ...(createdConvos?.map((c) => c.id) ?? []),
      ...(partRows?.map((p) => p.conversation_id) ?? []),
    ]),
  ).filter(Boolean) as string[];

  if (convoIds.length === 0) {
    return NextResponse.json<ConversationPayload[]>([], { status: 200 });
  }

  const { data: convos, error: convErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id, is_group, title")
    .in("id", convoIds);

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const safeConvos = (convos ?? []) as ConversationRow[];

  const { data: msgs, error: msgErr } = await admin
    .from("messages")
    .select("*")
    .in("conversation_id", convoIds)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (msgErr) {
    console.error("[my-conversations] msgErr:", msgErr);
  }

  const latestByConvo = new Map<string, MessageRow>();
  (msgs ?? []).forEach((m) => {
    const cid = m.conversation_id;
    if (cid && !latestByConvo.has(cid)) {
      latestByConvo.set(cid, m);
    }
  });

  const { data: allParticipants } = (await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convoIds)) as {
    data: ParticipantRow[] | null;
    error: { message: string } | null;
  };

  const userIdSet = new Set<string>();
  (allParticipants ?? []).forEach((row) => {
    if (row.user_id) userIdSet.add(row.user_id);
  });
  safeConvos.forEach((c) => {
    if (c.created_by) userIdSet.add(c.created_by);
  });

  const allUserIds = Array.from(userIdSet);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", allUserIds);

  const profileMap = new Map<string, Pick<ProfileRow, "full_name" | "email" | "avatar_url">>();
  (profiles ?? []).forEach((p) => {
    profileMap.set(p.id, {
      full_name: p.full_name,
      email: p.email,
      avatar_url: (p as { avatar_url?: string | null }).avatar_url ?? null,
    });
  });

  const displayNameFor = (userId: string | null): string | null => {
    if (!userId) return null;
    const p = profileMap.get(userId);
    return p?.full_name ?? p?.email ?? null;
  };

  const avatarFor = (userId: string | null): string | null => {
    if (!userId) return null;
    return profileMap.get(userId)?.avatar_url ?? null;
  };

  const { data: readRows } = (await admin
    .from("message_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id)
    .in("conversation_id", convoIds)) as {
    data: MessageReadRow[] | null;
    error: { message: string } | null;
  };

  const readByConversation = new Map<string, string>();
  (readRows ?? []).forEach((row) => {
    if (row.conversation_id) readByConversation.set(row.conversation_id, row.last_read_at);
  });

  const participantsByConvo = new Map<string, ParticipantInfo[]>();

  (allParticipants ?? []).forEach((row) => {
    if (!row.conversation_id || !row.user_id) return;
    const arr = participantsByConvo.get(row.conversation_id) ?? [];
    arr.push({
      id: row.user_id,
      full_name: displayNameFor(row.user_id),
      avatar_url: avatarFor(row.user_id),
    });
    participantsByConvo.set(row.conversation_id, arr);
  });

  safeConvos.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    if (!arr.some((p) => p.id === c.created_by)) {
      arr.push({
        id: c.created_by,
        full_name: displayNameFor(c.created_by),
        avatar_url: avatarFor(c.created_by),
      });
    }
    participantsByConvo.set(c.id, arr);
  });

  const payload: ConversationPayload[] = safeConvos.map((c) => {
    const latest = latestByConvo.get(c.id) ?? null;
    const lastReadAt = readByConversation.get(c.id);
    const unread = (msgs ?? []).filter((m) => {
      if (m.conversation_id !== c.id) return false;
      if (m.sender_id === user.id) return false;
      const sent = m.sent_at ?? m.created_at ?? "";
      return lastReadAt ? sent > lastReadAt : true;
    }).length;

    return {
      conversation: c,
      latest_message: latest,
      participants: participantsByConvo.get(c.id) ?? [],
      unread_count: unread,
    };
  });

  payload.sort((a, b) => {
    const at = a.latest_message?.sent_at ?? a.latest_message?.created_at ?? a.conversation.created_at ?? "";
    const bt = b.latest_message?.sent_at ?? b.latest_message?.created_at ?? b.conversation.created_at ?? "";
    return bt.localeCompare(at);
  });

  return NextResponse.json(payload, { status: 200 });
}
