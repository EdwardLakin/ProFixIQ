// app/api/chat/send-message/route.ts
import { NextResponse } from "next/server";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const userClient = createServerSupabaseRoute();

  // who is calling
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // body
  const body = (await req.json().catch(() => null)) as
    | {
        conversationId?: string;
        content?: string;
        senderId?: string;
      }
    | null;

  const conversationId = body?.conversationId;
  const content = body?.content?.trim() ?? "";
  const senderId = body?.senderId ?? user.id;

  if (!conversationId || !content) {
    return NextResponse.json(
      { error: "conversationId and content are required" },
      { status: 400 },
    );
  }

  // use admin so RLS on messages can't block us
  const admin = createAdminSupabase();

  // make sure conversation exists (optional but nice)
  const { data: convo, error: convoErr } = await admin
    .from("conversations")
    .select("id, created_by")
    .eq("id", conversationId)
    .maybeSingle();

  if (convoErr) {
    return NextResponse.json({ error: convoErr.message }, { status: 500 });
  }
  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // insert the message EXACTLY with the columns your table has
  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      chat_id: conversationId, // legacy field your UI still checks
      sender_id: senderId,
      content,
      sent_at: now,
      // these 3 are NOT NULL in your table, so let’s send them explicitly
      recipients: [],
      attachments: [],
      metadata: {},
    })
    .select("*")
    .maybeSingle();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 200 });
}