"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { getUserConversations } from "@ai/lib/chat/getUserConversations";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];

interface ConversationWithMeta extends Conversation {
  latest_message?: Message | null;
  unread_count: number;
}

interface Props {
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
}

export default function ConversationList({
  activeConversationId,
  setActiveConversationId,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);

  // initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getUserConversations(supabase);
        if (!cancelled) {
          // sort newest first
          result.sort((a, b) => {
            const at = a.latest_message?.sent_at || a.created_at || "";
            const bt = b.latest_message?.sent_at || b.created_at || "";
            return bt.localeCompare(at);
          });
          setConversations(result);
        }
      } catch (e) {
        console.error("Failed to load conversations:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // live updates
  useEffect(() => {
    const channel = supabase
      .channel("ai-conversation-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async () => {
          const result = await getUserConversations(supabase);
          result.sort((a, b) => {
            const at = a.latest_message?.sent_at || a.created_at || "";
            const bt = b.latest_message?.sent_at || b.created_at || "";
            return bt.localeCompare(at);
          });
          setConversations(result);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        async () => {
          const result = await getUserConversations(supabase);
          result.sort((a, b) => {
            const at = a.latest_message?.sent_at || a.created_at || "";
            const bt = b.latest_message?.sent_at || b.created_at || "";
            return bt.localeCompare(at);
          });
          setConversations(result);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="w-full">
      <h2 className="text-sm font-bold text-gray-400 px-3 mb-2">Chats</h2>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={clsx(
            "px-3 py-2 cursor-pointer rounded",
            conv.id === activeConversationId
              ? "bg-neutral-800 font-bold"
              : "hover:bg-neutral-900",
          )}
          onClick={() => setActiveConversationId(conv.id)}
        >
          <div className="flex justify-between items-center gap-2">
            <div className="text-sm truncate">
              {conv.context_type
                ? `${conv.context_type}: ${conv.id.slice(0, 6)}`
                : `Conversation ${conv.id.slice(0, 6)}`}
              <div className="text-xs text-gray-400 truncate max-w-[180px]">
                {conv.latest_message?.content || "No messages yet"}
              </div>
            </div>
            {conv.unread_count > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {conv.unread_count}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}