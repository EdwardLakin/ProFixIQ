// app/api/chat/get-messages/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type ParticipantRow =
  DB["public"]["Tables"]["conversation_participants"]["Row"];

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // 1) who is calling
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    conversationId?: string;
  } | null;

  const conversationId = body?.conversationId;
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
  }

  // 2) use admin so we always see fresh rows
  const admin = createAdminSupabase();

  // 2a) make sure the conversation exists
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (convoErr) {
    return NextResponse.json({ error: convoErr.message }, { status: 500 });
  }
  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 2b) make sure this user belongs
  let allowed = convo.created_by === user.id;

  if (!allowed) {
    const { data: participant, error: partErr } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle<Pick<ParticipantRow, "id">>();

    if (partErr) {
      return NextResponse.json({ error: partErr.message }, { status: 500 });
    }
    allowed = Boolean(participant);
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "You are not part of this conversation" },
      { status: 403 },
    );
  }

  // 3) fetch messages — support both new and legacy columns
  const { data: messages, error: msgErr } = await admin
    .from("messages")
    .select("*")
    .or(
      `conversation_id.eq.${conversationId},chat_id.eq.${conversationId}`,
    )
    .order("created_at", { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  return NextResponse.json<MessageRow[]>(messages ?? []);
}