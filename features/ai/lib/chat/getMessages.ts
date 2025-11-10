// app/api/chat/get-messages/route.ts
import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { conversationId } = await req.json().catch(() => ({}));

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminSupabase();

  // narrow, ordered, safe
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, content, sent_at, created_at"
    )
    .eq("conversation_id", conversationId)
    // first by sent_at (chat wants chronological)
    .order("sent_at", { ascending: true, nullsFirst: true })
    // then by created_at in case sent_at is null
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[get-messages] supabase error:", error);
    return NextResponse.json(
      { error: error.message ?? "Failed to load messages" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}