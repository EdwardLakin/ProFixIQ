// features/shared/chat/components/ChatDock.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import RecipientPickerModal from "@/features/shared/chat/components/RecipientPickerModalWrapper";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

type Conversation = {
  chatId: string;
  recipients: string[];         // user IDs (excluding duplicates)
  groupName?: string;
};

export default function ChatDock(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // dock open/close
  const [open, setOpen] = useState<boolean>(false);

  // auth identity
  const [me, setMe] = useState<string | null>(null);

  // active conversation
  const [conv, setConv] = useState<Conversation | null>(null);

  // messages in the active conversation
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // composer
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<boolean>(false);

  // recipient picker
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);

  // who am I?
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // helper: load entire message history for a chat
  const loadMessages = useCallback(async (chatId: string): Promise<void> => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (!error) setMessages((data ?? []) as MessageRow[]);
    setLoading(false);
  }, [supabase]);

  // realtime subscription for the active chat
  useEffect(() => {
    if (!conv?.chatId) return;
    const channel = supabase
      .channel(`dock-thread-${conv.chatId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT", filter: `chat_id=eq.${conv.chatId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, row]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, conv?.chatId]);

  // Start a new (or reuse an existing) conversation via RPC
  const onStartChat = useCallback(
    async (userIds: string[], groupName?: string): Promise<void> => {
      if (userIds.length === 0) return;

      // Use RPC; omit _chat_id so the function can reuse or create a thread.
      const { data, error } = await supabase.rpc("chat_post_message", {
        _recipients: Array.from(new Set(userIds)),
        _content:
          groupName && groupName.trim().length > 0
            ? `Started group: ${groupName.trim()}`
            : "Started conversation",
        // do NOT pass _chat_id here
      });

      if (error || !data) return;
      const chatId: string = String(data);

      // Set active conversation, close picker, load history, open dock
      setConv({ chatId, recipients: Array.from(new Set(userIds)), groupName });
      setPickerOpen(false);
      await loadMessages(chatId);
      setOpen(true);
    },
    [supabase, loadMessages],
  );

  // Send a message into the active conversation via RPC
  const send = useCallback(async (): Promise<void> => {
    if (!conv?.chatId || !me || sending) return;
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    setSending(true);
    try {
      const { error } = await supabase.rpc("chat_post_message", {
        _recipients: conv.recipients,
        _content: text,
        _chat_id: conv.chatId, // append to this conversation
      });
      if (!error && inputRef.current) inputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }, [supabase, conv, me, sending]);

  // UI title
  const title = conv
    ? (conv.groupName && conv.groupName.trim().length > 0
        ? conv.groupName
        : `Chat (${conv.recipients.length} recipient${conv.recipients.length === 1 ? "" : "s"})`)
    : "New Message";

  return (
    <>
      {/* Dock triggers */}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-orange-600 px-3 py-1.5 font-semibold text-black hover:bg-orange-700"
          onClick={() => setPickerOpen(true)}
        >
          New
        </button>
        <button
          type="button"
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close Chat" : "Open Chat"}
        </button>
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-4 right-4 z-[120] w-[min(420px,95vw)] overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <div className="font-semibold text-neutral-200">{title}</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                onClick={() => setPickerOpen(true)}
              >
                Change…
              </button>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-auto p-3">
            {loading ? (
              <div className="text-neutral-400">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="text-neutral-500">No messages yet.</div>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => {
                  const mine = m.sender_id === me;
                  return (
                    <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] whitespace-pre-wrap rounded px-3 py-2 text-sm ${
                          mine ? "bg-orange-600 text-black" : "bg-neutral-800 text-white"
                        }`}
                        title={m.created_at ?? ""}
                      >
                        {m.content ?? ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-neutral-800 p-2">
            <input
              ref={inputRef}
              className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white"
              placeholder={conv ? "Type a message…" : "Pick recipients to start…"}
              disabled={!conv || sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="rounded bg-orange-600 px-3 py-2 font-semibold text-black disabled:opacity-60"
              onClick={() => void send()}
              disabled={!conv || sending}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Recipient picker modal (wrapper is already `use client`) */}
      <RecipientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStartChat={onStartChat}
        allowGroup
      />
    </>
  );
}