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

type ParticipantInfo = { id: string; full_name: string | null };
type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: ParticipantInfo[];
  unread_count: number;
};

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
    .select("id, created_at, created_by, context_type, context_id")
    .eq("created_by", user.id);

  if (createdErr) {
    console.error("[my-conversations] createdErr:", createdErr);
    return NextResponse.json({ error: createdErr.message }, { status: 500 });
  }

  // conversations where I'm a participant
  const { data: partRows, error: partsErr } = await admin
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  if (partsErr) {
    console.error("[my-conversations] partsErr:", partsErr);
    return NextResponse.json({ error: partsErr.message }, { status: 500 });
  }

  const idSet = new Set<string>();
  (createdConvos ?? []).forEach((c) => c.id && idSet.add(c.id));
  (partRows ?? []).forEach((p) => p.conversation_id && idSet.add(p.conversation_id));

  const convoIds = Array.from(idSet);
  if (convoIds.length === 0) {
    return NextResponse.json<ConversationPayload[]>([], { status: 200 });
  }

  // load conversations
  const { data: convos, error: convErr } = await admin
    .from("conversations")
    .select("id, created_at, created_by, context_type, context_id")
    .in("id", convoIds);

  if (convErr) {
    console.error("[my-conversations] convErr:", convErr);
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }
  const safeConvos = (convos ?? []) as ConversationRow[];

  // latest messages (prefer sent_at desc, then created_at)
  const { data: msgs, error: msgErr } = await admin
    .from("messages")
    .select("*")
    .in("conversation_id", convoIds)
    .order("sent_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (msgErr) {
    console.error("[my-conversations] msgErr:", msgErr);
    // don’t fail the whole response — just continue with no messages
  }

  const latestByConvo = new Map<string, MessageRow>();
  (msgs ?? []).forEach((m) => {
    const cid = m.conversation_id;
    if (!cid || latestByConvo.has(cid)) return;
    latestByConvo.set(cid, m);
  });

  // participants with names via FK
  // (this avoids the brittle `.or(id.in...,user_id.in...)` dance)
  const { data: partsWithNames, error: partsNamesErr } = await admin
    .from("conversation_participants")
    .select(
      `
        conversation_id,
        user_id,
        profiles:profiles!conversation_participants_user_id_fkey (
          full_name
        )
      `,
    )
    .in("conversation_id", convoIds);

  if (partsNamesErr) {
    console.error("[my-conversations] partsNamesErr:", partsNamesErr);
    // fall back to id-only participants below
  }

  const participantsByConvo = new Map<string, ParticipantInfo[]>();
  (partsWithNames ?? []).forEach((row: any) => {
    const cid = row.conversation_id as string | null;
    const uid = row.user_id as string | null;
    if (!cid || !uid) return;
    const arr = participantsByConvo.get(cid) ?? [];
    arr.push({
      id: uid,
      full_name: row.profiles?.full_name ?? null,
    });
    participantsByConvo.set(cid, arr);
  });

  // ensure creator is listed as a participant
  safeConvos.forEach((c) => {
    if (!c.id || !c.created_by) return;
    const arr = participantsByConvo.get(c.id) ?? [];
    if (!arr.find((p) => p.id === c.created_by)) {
      arr.push({ id: c.created_by, full_name: null });
    }
    participantsByConvo.set(c.id, arr);
  });

  const payload: ConversationPayload[] = safeConvos.map((c) => ({
    conversation: c,
    latest_message: latestByConvo.get(c.id) ?? null,
    participants: participantsByConvo.get(c.id) ?? [],
    unread_count: 0,
  }));

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