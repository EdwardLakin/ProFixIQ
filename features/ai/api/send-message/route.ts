import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  const { conversationId, senderId, content } = await req.json();
  const supabase = createRouteHandlerClient<Database>({ cookies });

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
