// features/chat/components/ChatWindow.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Message = Database["public"]["Tables"]["messages"]["Row"];

type ChatWindowProps = {
  conversationId: string;
  userId: string;
};

export default function ChatWindow({ conversationId, userId }: ChatWindowProps) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Fetch existing messages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/get-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Message[] = await res.json();
        if (!cancelled) setMessages(data);
      } catch (err) {
        console.error("Fetch messages failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Live inserts for this conversation
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresInsertPayload<Message>) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId]);

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content) return;

    try {
      // (optional) optimistic UI:
      // setMessages((prev) => [...prev, { ...temp msg } as Message]);

      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          senderId: userId,
          content,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }, [conversationId, userId, newMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full border rounded bg-neutral-900 text-white">
      <div className="flex-1 p-4 overflow-y-auto space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-2 rounded ${
              msg.sender_id === userId
                ? "bg-orange-600 ml-auto text-right"
                : "bg-gray-700 mr-auto"
            }`}
          >
            <p className="text-sm break-words">{msg.content}</p>
            <p className="text-xs text-gray-400">
              {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString() : ""}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-gray-700 flex items-center gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded bg-neutral-800 border border-neutral-600 px-3 py-2"
        />
        <button
          onClick={handleSend}
          className="bg-orange-500 px-4 py-2 rounded hover:bg-orange-600 font-semibold"
        >
          Send
        </button>
      </div>
    </div>
  );
}