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
  // 1) auth with the normal (RLS) client – this tells us who the user is
  const userClient = createServerSupabaseRoute();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { conversationId } = (await req.json()) as {
    conversationId?: string;
  };

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId required" },
      { status: 400 },
    );
  }

  // 2) use admin client to dodge “I just inserted but RLS didn't see it yet”
  const admin = createAdminSupabase();

  // 2a) does the conversation exist?
  const {
    data: convo,
    error: convoErr,
  } = await admin
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

  // 2b) is this user allowed to see it? creator or participant
  let allowed = convo.created_by === user.id;

  if (!allowed) {
    const {
      data: participant,
      error: partErr,
    } = await admin
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

  // 3) finally get the messages (both new `conversation_id` and legacy `chat_id`)
  const { data, error } = await admin
    .from("messages")
    .select("*")
    .or(
      `conversation_id.eq.${conversationId},chat_id.eq.${conversationId}`,
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json<MessageRow[]>(data ?? []);
}