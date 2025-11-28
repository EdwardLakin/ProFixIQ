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
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

interface ParticipantInfo {
  id: string;
  full_name: string | null; // name or email fallback
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

  // ---------------------------------------------------------------------------
  // 1) Conversations I created
  // ---------------------------------------------------------------------------
  const { data: createdConvos, error: createdErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id")
    .eq("created_by", user.id);

  if (createdErr) {
    console.error("[my-conversations] createdErr:", createdErr);
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  // ---------------------------------------------------------------------------
  // 2) Conversations I'm a participant in
  // ---------------------------------------------------------------------------
  const { data: partRows, error: partsErr } = await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .eq("user_id", user.id);

  if (partsErr) {
    console.error("[my-conversations] partsErr:", partsErr);
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

  // ---------------------------------------------------------------------------
  // 3) All conversations in that set
  // ---------------------------------------------------------------------------
  const { data: convos, error: convErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id")
    .in("id", convoIds);

  if (convErr) {
    console.error("[my-conversations] convErr:", convErr);
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const safeConvos = (convos ?? []) as ConversationRow[];

  // ---------------------------------------------------------------------------
  // 4) Latest messages for those conversations
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 5) All participants for those conversations (no embedded join)
  // ---------------------------------------------------------------------------
  const {
    data: allParticipants,
    error: allPartsErr,
  } = (await admin
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", convoIds)) as {
    data: ParticipantRow[] | null;
    error: { message: string } | null;
  };

  if (allPartsErr) {
    console.error("[my-conversations] allPartsErr:", allPartsErr);
  }

  // ---------------------------------------------------------------------------
  // 6) Collect all user_ids we care about (participants + creators)
  // ---------------------------------------------------------------------------
  const userIdSet = new Set<string>();

  (allParticipants ?? []).forEach((row) => {
    if (row.user_id) userIdSet.add(row.user_id);
  });

  safeConvos.forEach((c) => {
    if (c.created_by) userIdSet.add(c.created_by);
  });

  const allUserIds = Array.from(userIdSet);

  // ---------------------------------------------------------------------------
  // 7) Fetch profiles once for all those users
  //     - assumes profiles.id == auth.user.id (Supabase default)
  // ---------------------------------------------------------------------------
  const { data: profiles, error: profilesErr } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", allUserIds);

  if (profilesErr) {
    console.error("[my-conversations] profilesErr:", profilesErr);
  }

  const profileMap = new Map<string, Pick<ProfileRow, "full_name" | "email">>();
  (profiles ?? []).forEach((p) => {
    profileMap.set(p.id, { full_name: p.full_name, email: p.email });
  });

  const displayNameFor = (userId: string | null): string | null => {
    if (!userId) return null;
    const p = profileMap.get(userId);
    if (!p) return null;
    return p.full_name ?? p.email ?? null;
  };

  // ---------------------------------------------------------------------------
  // 8) Build participantsByConvo
  // ---------------------------------------------------------------------------
  const participantsByConvo = new Map<string, ParticipantInfo[]>();

  (allParticipants ?? []).forEach((row) => {
    if (!row.conversation_id || !row.user_id) return;
    const arr = participantsByConvo.get(row.conversation_id) ?? [];
    arr.push({
      id: row.user_id,
      full_name: displayNameFor(row.user_id),
    });
    participantsByConvo.set(row.conversation_id, arr);
  });

  // Ensure creator is included as a participant with a label
  safeConvos.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    if (!arr.some((p) => p.id === c.created_by)) {
      arr.push({
        id: c.created_by,
        full_name: displayNameFor(c.created_by),
      });
    }
    participantsByConvo.set(c.id, arr);
  });

  // ---------------------------------------------------------------------------
  // 9) Build payload
  // ---------------------------------------------------------------------------
  const payload: ConversationPayload[] = safeConvos.map((c) => ({
    conversation: c,
    latest_message: latestByConvo.get(c.id) ?? null,
    participants: participantsByConvo.get(c.id) ?? [],
    unread_count: 0,
  }));

  // Sort newest first
  payload.sort((a, b) => {
    const at =
      a.latest_message?.sent_at ??
      a.latest_message?.created_at ??
      a.conversation.created_at ??
      "";
    const bt =
      b.latest_message?.sent_at ??
      b.latest_message?.created_at ??
      b.conversation.created_at ??
      "";
    return bt.localeCompare(at);
  });

  return NextResponse.json(payload, { status: 200 });
}