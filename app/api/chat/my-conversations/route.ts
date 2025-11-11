// app/api/chat/my-conversations/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ParticipantRow =
  DB["public"]["Tables"]["conversation_participants"]["Row"];

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminSupabase();

  // conversations I created
  const { data: createdConvos, error: createdErr } = await admin
    .from("conversations")
    .select("*")
    .eq("created_by", user.id)
    .returns<ConversationRow[]>();

  if (createdErr) {
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  // conversations I'm participant in
  const {
    data: participantRows,
    error: partsErr,
  } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id)
    .returns<Pick<ParticipantRow, "conversation_id">[]>();

  if (partsErr) {
    return NextResponse.json({ error: partsErr.message }, { status: 500 });
  }

  const convoIdSet = new Set<string>();
  (createdConvos ?? []).forEach((c) => {
    if (c.id) convoIdSet.add(c.id);
  });
  (participantRows ?? []).forEach((p) => {
    if (p.conversation_id) convoIdSet.add(p.conversation_id);
  });

  const convoIds = Array.from(convoIdSet);
  if (convoIds.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  // load those conversations
  const { data: allConvos, error: allConvosErr } = await admin
    .from("conversations")
    .select("*")
    .in("id", convoIds)
    .returns<ConversationRow[]>();

  if (allConvosErr) {
    return NextResponse.json({ error: allConvosErr.message }, { status: 500 });
  }

  // recent messages for those conversations
  const {
    data: convoMessages,
    error: msgErr,
  } = await admin
    .from("messages")
    .select("*")
    .in("conversation_id", convoIds)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<MessageRow[]>();

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  const latestByConvo = new Map<string, MessageRow>();
  (convoMessages ?? []).forEach((m) => {
    const cid = m.conversation_id ?? "";
    if (!cid) return;
    if (!latestByConvo.has(cid)) {
      latestByConvo.set(cid, m);
    }
  });

  // participants (with names)
  const {
    data: allParticipants,
    error: allPartsErr,
  } = await admin
    .from("conversation_participants")
    .select(
      `
      conversation_id,
      user_id,
      profiles!conversation_participants_user_id_fkey (
        full_name
      )
    `,
    )
    .in("conversation_id", convoIds);

  if (allPartsErr) {
    return NextResponse.json({ error: allPartsErr.message }, { status: 500 });
  }

  const payload = (allConvos ?? []).map((c) => {
    const latest_message = latestByConvo.get(c.id) ?? null;
    const participantsForConvo =
      (allParticipants ?? [])
        .filter((p) => p.conversation_id === c.id)
        .map((p) => ({
          id: p.user_id,
          // @ts-expect-error nested select
          full_name: p.profiles?.full_name ?? null,
        })) ?? [];

    return {
      conversation: c,
      latest_message,
      participants: participantsForConvo,
      unread_count: 0,
    };
  });

  return NextResponse.json(payload, { status: 200 });
}