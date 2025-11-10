// app/api/chat/send-message/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessageInsert = DB["public"]["Tables"]["messages"]["Insert"];

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    conversationId: string;
    content: string;
    senderId?: string;
    recipients?: string[];
  };

  const conversationId = body.conversationId;
  const content = body.content?.trim() ?? "";
  const senderId = body.senderId ?? user.id;
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  if (!conversationId || !content) {
    return NextResponse.json(
      { error: "conversationId and content are required" },
      { status: 400 }
    );
  }

  const payload: MessageInsert = {
    conversation_id: conversationId,
    // keep this for the old pages until everything is migrated
    chat_id: conversationId,
    sender_id: senderId,
    content,
    recipients,
    sent_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert(payload)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted ?? { ok: true });
}