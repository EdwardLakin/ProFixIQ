// features/ai/components/chat/ChatWindow.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Message = Database["public"]["Tables"]["messages"]["Row"];

type ChatWindowProps = {
  conversationId: string;
  userId: string;
  title?: string;
};

// Helper type for Realtime broadcast payloads coming from realtime.broadcast_changes
type BroadcastPayload<T> = {
  payload?: {
    record?: T;
    new?: T;
    old?: T | null;
    [key: string]: unknown;
  };
  record?: T;
  new?: T;
  old?: T | null;
  [key: string]: unknown;
};

function extractRecord<T>(payload: BroadcastPayload<T>): T | null {
  return (
    payload?.payload?.record ??
    payload?.payload?.new ??
    payload?.record ??
    payload?.new ??
    null
  ) as T | null;
}

export default function ChatWindow({
  conversationId,
  userId,
  title = "Conversation",
}: ChatWindowProps) {
  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setError(null);
    try {
      const res = await fetch("/api/chat/get-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Message[];
      setMessages((prev) =>
        prev.length > 0 && data.length === 0 ? prev : data,
      );
    } catch (err) {
      console.error("[ChatWindow] fetchMessages error:", err);
      setError("Couldn't load messages.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // initial load
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    void fetchMessages();
  }, [conversationId, fetchMessages]);

  // 🔁 gentle polling safety net (no postgres_changes)
  useEffect(() => {
    if (!conversationId) return;
    const id = window.setInterval(() => {
      void fetchMessages();
    }, 4000); // every 4s
    return () => window.clearInterval(id);
  }, [conversationId, fetchMessages]);

  // 🛡️ Set auth token for Realtime (safe even if not strictly required)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token && mounted) {
        try {
          await supabase.realtime.setAuth(token);
          console.log("[ChatWindow] realtime.setAuth OK");
        } catch (e) {
          console.warn("[ChatWindow] realtime.setAuth failed", e);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [supabase]);

  // 🔔 Realtime broadcast from `public.broadcast_chat_messages`
  useEffect(() => {
    if (!conversationId) return;

    const topic = `room:${conversationId}:messages`;

    const channel = supabase
      .channel(topic, {
        config: {
          private: true,
          broadcast: {
            self: true,
            ack: true,
          },
        } as any,
      })
      .on(
        "broadcast",
        { event: "INSERT" },
        (payload: BroadcastPayload<Message>) => {
          console.log("[ChatWindow] broadcast INSERT", payload);
          const msg = extractRecord<Message>(payload);
          if (!msg) return;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .on(
        "broadcast",
        { event: "UPDATE" },
        (payload: BroadcastPayload<Message>) => {
          console.log("[ChatWindow] broadcast UPDATE", payload);
          const msg = extractRecord<Message>(payload);
          if (!msg) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? msg : m)),
          );
        },
      )
      .on(
        "broadcast",
        { event: "DELETE" },
        (payload: BroadcastPayload<Message>) => {
          console.log("[ChatWindow] broadcast DELETE", payload);
          const msg =
            (payload?.payload?.old as Message | undefined) ??
            (payload.old as Message | undefined) ??
            null;
          if (!msg) return;
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        },
      )
      .subscribe((status) => {
        console.log("[ChatWindow] broadcast subscribe status", status, topic);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId]);

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // focus once
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
        console.error(
          "[ChatWindow] send-message failed:",
          await res.text(),
        );
        setError("Message failed to send.");
        // let polling / next fetch sync things up
      }
    } catch (err) {
      console.error("[ChatWindow] sendMessage error:", err);
      setError("Message failed to send.");
    } finally {
      setSending(false);
    }
  }, [conversationId, newMessage, sending, userId]);

  const deleteMessage = useCallback(
    async (id: string) => {
      const prev = messages;
      setMessages((curr) => curr.filter((m) => m.id !== id));
      try {
        const res = await fetch("/api/chat/delete-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          console.error(
            "[ChatWindow] delete-message failed:",
            await res.text(),
          );
          setMessages(prev);
        }
      } catch (err) {
        console.error("[ChatWindow] deleteMessage error:", err);
        setMessages(prev);
      }
    },
    [messages],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  // group & render helpers
  const grouped = useMemo(() => {
    const byDay: Array<
      | { type: "day"; label: string }
      | { type: "msg"; msg: Message; isMine: boolean; showAvatar: boolean }
    > = [];

    let lastDay = "";
    let lastSender = "";

    messages.forEach((m) => {
      const day = m.sent_at ? new Date(m.sent_at).toDateString() : "Unknown";
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
    <div className="flex h-full flex-col rounded border border-[var(--metal-border-soft)] bg-[var(--metal-surface)] text-neutral-50">
      {/* header */}
      <div className="border-b border-[var(--metal-border-soft)] px-4 py-3 flex items-center justify-between">
        <div className="text-sm font-medium text-neutral-100">{title}</div>
        {error ? (
          <div className="text-[10px] text-red-200/80">{error}</div>
        ) : null}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {loading ? (
          <div className="text-center text-neutral-400 text-sm py-6">
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
                  <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] text-neutral-400">
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
                  <div className="mt-6 h-7 w-7 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-100/80">
                    U
                  </div>
                ) : (
                  !isMine && <div className="w-7" />
                )}

                <div className="relative">
                  <div
                    className={[
                      "inline-block",
                      "max-w-[80%]",
                      "rounded-2xl",
                      "px-3 py-2 text-sm",
                      "whitespace-pre-wrap break-words",
                      isMine
                        ? "bg-[var(--accent-copper-soft)] text-black"
                        : "bg-black/50 text-neutral-100",
                    ].join(" ")}
                  >
                    <p>{msg.content}</p>
                    {time ? (
                      <p
                        className={[
                          "mt-1 text-[10px]",
                          isMine ? "text-black/60" : "text-neutral-400",
                        ].join(" ")}
                      >
                        {time}
                      </p>
                    ) : null}
                  </div>

                  {isMine ? (
                    <button
                      type="button"
                      onClick={() => void deleteMessage(msg.id)}
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-black/70 text-[10px] text-white/70 hover:bg-red-500 hover:text-white"
                      aria-label="Delete message"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="border-t border-[var(--metal-border-soft)] bg-black/40 p-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          className="flex-1 resize-none rounded bg-black/70 border border-[var(--metal-border-soft)] px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)] focus:outline-none"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={sending || !newMessage.trim()}
          className="rounded-full border border-[var(--accent-copper-soft)] bg-black/70 px-4 py-2 text-sm font-semibold text-[var(--accent-copper-soft)] shadow-[0_10px_24px_rgba(0,0,0,0.85)] hover:bg-black/90 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}