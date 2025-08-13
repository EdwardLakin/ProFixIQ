// lib/chat/helpers.ts

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

const supabase = createServerComponentClient<Database>({ cookies });

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return data ?? [];
}

export async function getUserConversations(userId: string) {
  const { data, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations(*)")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching user conversations:", error);
    return [];
  }

  // Guard in case a row has no joined conversation
  return (data ?? [])
    .map((entry) => entry.conversations)
    .filter(Boolean);
}

export async function sendMessage({
  conversationId,
  senderId,
  content,
}: {
  conversationId: string;
  senderId: string;
  content: string;
}) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
  });

  if (error) {
    console.error("Error sending message:", error);
    return false;
  }

  return true;
}