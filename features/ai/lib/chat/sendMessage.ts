// lib/chat/sendMessage.ts
"use server";

import { cookies } from "next/headers";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function sendMessage({
  conversation_id,
  content,
}: {
  conversation_id: string;
  content: string;
}) {
  // make the client INSIDE the action
  const supabase = createServerActionClient<Database>({ cookies });

  // get current user so we don’t have to pass sender_id from client
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new Error("Not authenticated");
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id,
    sender_id: user.id,
    content,
  });

  if (error) {
    console.error("Failed to send message:", error.message);
    throw new Error(error.message);
  }

  return { success: true };
}