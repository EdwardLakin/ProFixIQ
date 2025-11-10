// app/api/chat/send-message/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { conversationId, senderId, content } = await req.json().catch(() => ({}));

  if (!conversationId || !senderId || !content?.trim()) {
    return NextResponse.json(
      { error: "conversationId, senderId, and content are required" },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: content.trim(),
      // sent_at is good to set here so reads can sort on it
      sent_at: new Date().toISOString(),
    })
    .select("id, conversation_id, sender_id, content, sent_at, created_at")
    .maybeSingle();

  if (error) {
    console.error("[send-message] supabase error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to send message" },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}