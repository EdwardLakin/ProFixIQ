// features/parts/components/PartsRequestChat.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

type Message = Database["public"]["Tables"]["parts_request_messages"]["Row"];

interface Props {
  // allow null/undefined from parents safely
  requestId: string | null | undefined;
  senderId: string;
}

export default function PartsRequestChat({ requestId, senderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Fetch messages (guard if requestId isn't ready)
  useEffect(() => {
    if (!requestId) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("parts_request_messages")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to load parts request messages:", error);
        return;
      }
      if (!cancelled && data) setMessages(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, supabase]);

  // Realtime inserts (guard if requestId isn't ready)
  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`req-messages-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "parts_request_messages",
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages((prev) => [...prev, newMessage]);
          if (newMessage.sender_id !== senderId) {
            toast.info("New message on request");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, senderId, supabase]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const content = newMsg.trim();
    if (!requestId || !content) return;

    const { error } = await supabase.from("parts_request_messages").insert({
      id: uuidv4(),
      request_id: requestId,
      sender_id: senderId,
      message: content,
    });

    if (error) {
      console.error("Failed to send parts request message:", error);
      toast.error("Failed to send message");
    } else {
      setNewMsg("");
    }
  };

  // If we don't have a valid request, render nothing (or a placeholder)
  if (!requestId) {
    return null;
  }

  return (
    <div className="border-t border-gray-700 mt-3 pt-2">
      <div className="max-h-40 overflow-y-auto space-y-2 text-sm">
        {messages.map((msg) => {
          const ts = msg.created_at ? new Date(msg.created_at) : null;
          return (
            <div
              key={msg.id}
              className={`p-2 rounded ${
                msg.sender_id === senderId
                  ? "bg-orange-600 text-white ml-auto text-right"
                  : "bg-gray-700 text-white mr-auto"
              }`}
            >
              <p>{msg.message}</p>
              <p className="text-xs text-gray-400">
                {ts ? ts.toLocaleTimeString() : ""}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded bg-neutral-800 border border-neutral-600 px-3 py-2 text-white"
        />
        <button
          onClick={handleSend}
          className="bg-orange-500 hover:bg-orange-600 px-3 py-1 rounded text-white"
          disabled={!requestId || !newMsg.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}