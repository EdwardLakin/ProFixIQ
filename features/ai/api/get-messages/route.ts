import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/supabase";

export async function POST(req: Request) {
  const { conversationId } = await req.json();
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json(data);
}
