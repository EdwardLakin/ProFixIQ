import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "@shared/types/types/supabase";

const supabase = createServerActionClient<Database>({ cookies });

export async function sendMessage({
  conversation_id,
  sender_id,
  content,
}: {
  conversation_id: string;
  sender_id: string;
  content: string;
}) {
  const { error } = await supabase.from("messages").insert({
    conversation_id,
    sender_id,
    content,
  });

  if (error) {
    console.error("Failed to send message:", error.message);
    throw new Error(error.message);
  }

  return { success: true };
}
