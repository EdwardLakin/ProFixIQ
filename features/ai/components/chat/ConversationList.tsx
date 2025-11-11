// features/ai/components/chat/ConversationList.tsx
"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type ConversationPayload = {
  conversation: {
    id: string;
    created_at: string | null;
    context_type: string | null;
    context_id: string | null;
    created_by: string | null;
  };
  latest_message: {
    id: string;
    conversation_id: string | null;
    sender_id: string | null;
    content: string | null;
    sent_at: string | null;
    created_at: string | null;
  } | null;
  participants: Array<{ id: string; full_name: string | null }>;
  unread_count: number;
};

interface Props {
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
}

export default function ConversationList({
  activeConversationId,
  setActiveConversationId,
}: Props) {
  const [conversations, setConversations] = useState<ConversationPayload[]>([]);

  // fetch from API (same data as /chat page)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/my-conversations", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setConversations([]);
          return;
        }
        const data = (await res.json()) as ConversationPayload[];
        if (!cancelled) {
          // sort newest first
          data.sort((a, b) => {
            const at =
              a.latest_message?.sent_at ||
              a.conversation.created_at ||
              "1970-01-01";
            const bt =
              b.latest_message?.sent_at ||
              b.conversation.created_at ||
              "1970-01-01";
            return bt.localeCompare(at);
          });
          setConversations(data);
        }
      } catch (err) {
        console.error("Failed to load conversations:", err);
        if (!cancelled) setConversations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    const prev = conversations;
    setConversations((curr) =>
      curr.filter((c) => c.conversation.id !== id),
    );
    if (activeConversationId === id) {
      setActiveConversationId("");
    }

    const res = await fetch("/api/chat/delete-conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      console.error("Failed to delete conversation", await res.text());
      setConversations(prev);
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-sm font-bold text-gray-400 px-3 mb-2">Chats</h2>
      {conversations.map((item) => {
        const conv = item.conversation;
        const latest = item.latest_message;
        const label =
          item.participants[0]?.full_name ??
          conv.context_type ??
          `Conversation ${conv.id.slice(0, 6)}`;

        return (
          <div
            key={conv.id}
            className={clsx(
              "group flex items-center gap-2 px-3 py-2 rounded",
              conv.id === activeConversationId
                ? "bg-neutral-800 font-bold"
                : "hover:bg-neutral-900",
            )}
          >
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => setActiveConversationId(conv.id)}
            >
              <div className="flex items-center gap-2">
                <div className="text-sm truncate">{label}</div>
                {item.unread_count > 0 && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.unread_count}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate max-w-[180px]">
                {latest?.content || "No messages yet"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleDelete(conv.id)}
              className="opacity-0 group-hover:opacity-100 text-xs text-neutral-500 hover:text-red-500 transition"
              aria-label="Delete conversation"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}