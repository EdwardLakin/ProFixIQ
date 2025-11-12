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
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

interface ParticipantInfo {
  id: string;
  full_name: string | null; // will be name or email fallback
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

  // Conversations I created
  const { data: createdConvos, error: createdErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id")
    .eq("created_by", user.id);

  if (createdErr) {
    console.error("[my-conversations] createdErr:", createdErr);
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  // Conversations I'm a participant in
  const { data: partRows, error: partsErr } = await admin
    .from("conversation_participants")
    .select("conversation_id")
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

  // All conversations
  const { data: convos, error: convErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id")
    .in("id", convoIds);

  if (convErr) {
    console.error("[my-conversations] convErr:", convErr);
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  const safeConvos = (convos ?? []) as ConversationRow[];

  // Latest messages
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

  // Participants WITH profile (name/email)
  type ParticipantWithProfile = ParticipantRow & {
    profiles: Pick<ProfileRow, "full_name" | "email"> | null;
  };

  const { data: partsWithNames, error: partsNamesErr } = await admin
    .from("conversation_participants")
    .select(
      `
        conversation_id,
        user_id,
        profiles:profiles!conversation_participants_user_id_fkey ( full_name, email )
      `,
    )
    .in("conversation_id", convoIds);

  if (partsNamesErr) {
    console.error("[my-conversations] partsNamesErr:", partsNamesErr);
  }

  const participantsByConvo = new Map<string, ParticipantInfo[]>();
  (partsWithNames as ParticipantWithProfile[] | null)?.forEach((row) => {
    if (!row.conversation_id || !row.user_id) return;
    const arr = participantsByConvo.get(row.conversation_id) ?? [];
    const display = row.profiles?.full_name ?? row.profiles?.email ?? null;
    arr.push({
      id: row.user_id,
      full_name: display,
    });
    participantsByConvo.set(row.conversation_id, arr);
  });

  // Ensure creator is included with a label (name→email fallback)
  const creatorIds = Array.from(
    new Set(
      safeConvos
        .map((c) => c.created_by)
        .filter(Boolean) as string[],
    ),
  );

  let creatorProfileMap = new Map<string, string | null>();
  if (creatorIds.length > 0) {
    const { data: creators, error: creatorsErr } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", creatorIds);

    if (creatorsErr) {
      console.error("[my-conversations] creatorsErr:", creatorsErr);
    }

    (creators ?? []).forEach((p) => {
      creatorProfileMap.set(p.id, p.full_name ?? p.email ?? null);
    });
  }

  safeConvos.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    if (!arr.some((p) => p.id === c.created_by)) {
      const display = creatorProfileMap.get(c.created_by) ?? null;
      arr.push({ id: c.created_by, full_name: display });
    }
    participantsByConvo.set(c.id, arr);
  });

  // Build payload
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