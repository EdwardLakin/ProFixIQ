// components/PartsRequestChat.tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

type Message = Database["public"]["Tables"]["parts_request_messages"]["Row"];

interface Props {
  requestId: string;
  senderId: string;
}

export default function PartsRequestChat({ requestId, senderId }: Props) {
    const supabase = createClientComponentClient<Database>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("parts_request_messages")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (data) setMessages(data);
    };

    fetchMessages();
  }, [requestId]);

  useEffect(() => {
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
  }, [requestId, senderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim()) return;

    const { error } = await supabase.from("parts_request_messages").insert({
      id: uuidv4(),
      request_id: requestId,
      sender_id: senderId,
      message: newMsg.trim(),
    });

    if (error) {
      toast.error("Failed to send message");
    } else {
      setNewMsg("");
    }
  };

  return (
    <div className="border-t border-gray-700 mt-3 pt-2">
      <div className="max-h-40 overflow-y-auto space-y-2 text-sm">
        {messages.map((msg) => (
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
              {new Date(msg.created_at).toLocaleTimeString()}
            </p>
          </div>
        ))}
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
        >
          Send
        </button>
      </div>
    </div>
  );
}
