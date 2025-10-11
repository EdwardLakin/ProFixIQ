import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function POST(req: Request) {
  const { conversationId, senderId, content } = await req.json();

  if (!conversationId || !senderId || !content?.trim()) {
    return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
  });

  if (error) {
    console.error("Error sending message:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}