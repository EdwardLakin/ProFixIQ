"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Message = Database["public"]["Tables"]["messages"]["Row"];

type ChatWindowProps = {
  conversationId: string;
  userId: string;
  title?: string;
};

export default function ChatWindow({
  conversationId,
  userId,
  title = "Conversation",
}: ChatWindowProps) {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    []
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/get-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Message[];
      setMessages(data);
    } catch (err) {
      console.error("Fetch messages failed:", err);
      setError("Couldn't load messages.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // initial fetch
  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  // realtime inserts
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

  // scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // focus composer once
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: userId,
      content,
      sent_at: new Date().toISOString(),
      // keep the rest as-is
    } as Message;

    setMessages((prev) => [...prev, optimistic]);
    setNewMessage("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          senderId: userId,
          content,
          recipients: [],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("send failed:", text);
        setError("Message failed to send.");
        // try to pull the real list once more in case the insert actually happened
        void fetchMessages();
      }
      // otherwise realtime will add the real row
    } catch (err) {
      console.error("send failed:", err);
      setError("Message failed to send.");
      // don't remove the optimistic bubble
    } finally {
      setSending(false);
    }
  }, [conversationId, newMessage, sending, userId, fetchMessages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  // group messages by day + sender (unchanged)
  const grouped = useMemo(() => {
    const byDay: Array<
      | { type: "day"; label: string }
      | { type: "msg"; msg: Message; isMine: boolean; showAvatar: boolean }
    > = [];

    let lastDay = "";
    let lastSender = "";

    messages.forEach((m) => {
      const day = m.sent_at
        ? new Date(m.sent_at).toDateString()
        : "Unknown";
      if (day !== lastDay) {
        byDay.push({ type: "day", label: day });
        lastDay = day;
        lastSender = "";
      }

      const isMine = m.sender_id === userId;
      const showAvatar = m.sender_id !== lastSender;
      byDay.push({ type: "msg", msg: m, isMine, showAvatar });

      lastSender = m.sender_id ?? "";
    });

    return byDay;
  }, [messages, userId]);

  return (
    <div className="flex h-full flex-col rounded border border-neutral-800 bg-neutral-950 text-white">
      <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="text-sm font-medium text-neutral-200">{title}</div>
        {error ? (
          <div className="text-[10px] text-red-200/80">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {loading ? (
          <div className="text-center text-neutral-500 text-sm py-6">
            Loading messages…
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center text-neutral-500 text-sm py-6">
            No messages yet. Say hi 👋
          </div>
        ) : (
          grouped.map((item, idx) => {
            if (item.type === "day") {
              return (
                <div key={`day-${idx}`} className="flex justify-center">
                  <span className="rounded-full bg-neutral-900 px-3 py-1 text-[11px] text-neutral-400">
                    {item.label}
                  </span>
                </div>
              );
            }

            const { msg, isMine, showAvatar } = item;
            const time =
              msg.sent_at &&
              new Date(msg.sent_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${
                  isMine ? "justify-end" : "justify-start"
                }`}
              >
                {!isMine && showAvatar ? (
                  <div className="mt-6 h-7 w-7 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] text-white/80">
                    U
                  </div>
                ) : (
                  !isMine && <div className="w-7" />
                )}

                <div
                  className={`max-w-[70%] rounded-md px-3 py-2 text-sm break-words ${
                    isMine
                      ? "bg-orange-500 text-black"
                      : "bg-neutral-800 text-neutral-100"
                  }`}
                >
                  <p>{msg.content}</p>
                  {time ? (
                    <p
                      className={`mt-1 text-[10px] ${
                        isMine ? "text-black/60" : "text-neutral-400"
                      }`}
                    >
                      {time}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          className="flex-1 resize-none rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={sending || !newMessage.trim()}
          className="rounded border border-orange-500/70 text-orange-200 px-4 py-2 text-sm font-semibold hover:bg-orange-500/10 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}