// app/api/chat/get-messages/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { conversationId } = (await req.json()) as { conversationId: string };

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // simplest: pull the ones for that conversation_id
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `conversation_id.eq.${conversationId},chat_id.eq.${conversationId}`
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json<MessageRow[]>(data ?? []);
}