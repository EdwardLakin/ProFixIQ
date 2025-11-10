// lib/chat/getMessages.ts
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function getMessages(conversation_id: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  // (optional) check they’re in this conversation:
  // const { data: { user } } = await supabase.auth.getUser();
  // ... join on conversation_participants ...

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation_id)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch messages:", error.message);
    return [];
  }

  return data;
}