"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import RecipientPickerModal from "@/features/shared/chat/components/RecipientPickerModalWrapper";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

type Conversation = {
  chatId: string;
  recipients: string[]; // user ids
  groupName?: string;
};

export default function ChatDock(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [open, setOpen] = useState<boolean>(false);

  // auth
  const [me, setMe] = useState<string | null>(null);

  // active conversation
  const [conv, setConv] = useState<Conversation | null>(null);

  // messages
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // compose
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<boolean>(false);

  // recipient picker
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);

  // who am I
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // realtime updates for current thread
  useEffect(() => {
    if (!conv?.chatId) return;

    const ch = supabase
      .channel(`messages-${conv.chatId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT", filter: `chat_id=eq.${conv.chatId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, row].sort((a, b) => {
            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [supabase, conv?.chatId]);

  // load history for a thread
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

  // Start conversation via RPC (server decides reuse/new)
  const onStartChat = useCallback(
    async (userIds: string[], groupName?: string): Promise<void> => {
      if (!me || userIds.length === 0) return;

      const { data, error } = await supabase.rpc("chat_post_message", {
        _recipients: userIds,
        _content:
          groupName && groupName.trim().length > 0
            ? `Started group: ${groupName.trim()}`
            : "Started conversation",
        _chat_id: null as unknown as string | undefined,
      });

      if (error || !data) return;

      const chatId = String(data);
      setConv({ chatId, recipients: userIds, groupName });
      await loadMessages(chatId);
      setPickerOpen(false);
      setOpen(true);
    },
    [me, supabase, loadMessages]
  );

  // Send message via RPC
  const send = useCallback(async (): Promise<void> => {
    if (!conv?.chatId || !me || sending) return;
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    setSending(true);
    try {
      const { error } = await supabase.rpc("chat_post_message", {
        _recipients: conv.recipients,
        _content: text,
        _chat_id: conv.chatId,
      });
      if (!error && inputRef.current) inputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }, [conv, me, supabase, sending]);

  const title = useMemo(() => {
    if (!conv) return "New Message";
    if (conv.groupName) return conv.groupName;
    return `Chat (${conv.recipients.length} recipient${conv.recipients.length === 1 ? "" : "s"})`;
  }, [conv]);

  return (
    <>
      {/* Triggers */}
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

      {/* Recipient picker */}
      <RecipientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStartChat={(ids, groupName) => onStartChat(ids, groupName)}
        allowGroup
      />
    </>
  );
}