import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "@shared/types/types/supabase";

const supabase = createServerComponentClient<Database>({ cookies });

export async function getMessages(conversation_id: string) {
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
