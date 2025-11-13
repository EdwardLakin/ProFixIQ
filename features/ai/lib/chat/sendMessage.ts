// app/api/chat/send-message/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessagesTable = DB["public"]["Tables"]["messages"];
type MessageInsert = MessagesTable["Insert"];
type ConversationsTable = DB["public"]["Tables"]["conversations"]["Row"];
type ParticipantsTable =
  DB["public"]["Tables"]["conversation_participants"]["Row"];

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  // 1. get the user from the request cookie/session
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2. parse body
  const body = (await req.json()) as {
    conversationId: string;
    content: string;
    senderId?: string;
    recipients?: string[];
  };

  const conversationId = body.conversationId;
  const content = body.content?.trim() ?? "";
  const senderId = body.senderId ?? user.id;

  if (!conversationId || !content) {
    return NextResponse.json(
      { error: "conversationId and content are required" },
      { status: 400 },
    );
  }

  // 3. use admin client to avoid RLS race, but still check user is allowed
  const admin = createAdminSupabase();

  // 3a. make sure conversation exists
  const {
    data: convo,
    error: convoErr,
  } = await admin
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle<ConversationsTable>();

  if (convoErr) {
    return NextResponse.json({ error: convoErr.message }, { status: 500 });
  }
  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // 3b. check the user is either the creator or a participant
  const isCreator = convo.created_by === user.id;

  let isParticipant = false;
  if (!isCreator) {
    const {
      data: participant,
      error: participantErr,
    } = await admin
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle<Pick<ParticipantsTable, "id">>();

    if (participantErr) {
      return NextResponse.json({ error: participantErr.message }, { status: 500 });
    }
    isParticipant = Boolean(participant);
  }

  if (!isCreator && !isParticipant) {
    return NextResponse.json(
      { error: "You are not part of this conversation" },
      { status: 403 },
    );
  }

  // 4. insert the message with admin client (so no RLS race)
  const messagePayload: MessageInsert = {
    conversation_id: conversationId,
    // chat_id removed – column no longer exists in types
    sender_id: senderId,
    content,
    recipients: Array.isArray(body.recipients) ? body.recipients : [],
    sent_at: new Date().toISOString(),
  };

  const {
    data: inserted,
    error: insertErr,
  } = await admin
    .from("messages")
    .insert(messagePayload)
    .select()
    .maybeSingle<MessagesTable>();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(inserted ?? messagePayload, { status: 200 });
}