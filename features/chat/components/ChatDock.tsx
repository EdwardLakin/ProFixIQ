"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import RecipientPickerModal from "@/features/shared/chat/components/RecipientPickerModal";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

type Conversation = {
  chatId: string;
  recipients: string[]; // user ids (excluding me or including me — we will dedupe for display)
  groupName?: string;
};

export default function ChatDock() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [open, setOpen] = useState(false);

  // auth
  const [me, setMe] = useState<string | null>(null);

  // current conversation
  const [conv, setConv] = useState<Conversation | null>(null);

  // message list
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);

  // compose
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  // recipient picker
  const [pickerOpen, setPickerOpen] = useState(false);

  // load current user id
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // subscribe to realtime messages for the active chat
  useEffect(() => {
    if (!conv?.chatId) return;

    const channel = supabase
      .channel(`messages-${conv.chatId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT", filter: `chat_id=eq.${conv.chatId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, row].sort(sortByCreated));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conv?.chatId]);

  // helper: sort newest last
  function sortByCreated(a: MessageRow, b: MessageRow) {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  }

  // load history when a conversation is set
  const loadMessages = useCallback(async (chatId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (!error) setMessages((data ?? []) as MessageRow[]);
    setLoading(false);
  }, [supabase]);

  // start a conversation from the picker
  const onStartChat = useCallback(async (userIds: string[], groupName?: string) => {
    if (!me || userIds.length === 0) return;

    const chatId = crypto.randomUUID();
    const recipients = Array.from(new Set(userIds));

    // Set active conversation and load (will be empty initially)
    setConv({ chatId, recipients, groupName });
    setPickerOpen(false);

    // Optionally seed a system message for the thread start (comment out if undesired)
    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: me,
      recipients,
      content: groupName ? `Started group chat: ${groupName}` : "Started conversation",
    });

    await loadMessages(chatId);
    setOpen(true);
  }, [me, supabase, loadMessages]);

  // send a new message
  const send = useCallback(async () => {
    if (!conv?.chatId || !me || sending) return;
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: conv.chatId,
        sender_id: me,
        recipients: conv.recipients,
        content: text,
      });
      if (!error && inputRef.current) inputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }, [conv, me, supabase, sending]);

  // UI helpers
  const title = useMemo(() => {
    if (!conv) return "New Message";
    if (conv.groupName) return conv.groupName;
    return `Chat (${conv.recipients.length} recipient${conv.recipients.length === 1 ? "" : "s"})`;
  }, [conv]);

  return (
    <>
      {/* Dock trigger */}
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

      {/* Recipient picker modal */}
      <RecipientPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStartChat={(ids, groupName) => onStartChat(ids, groupName)}
        allowGroup={true}
      />
    </>
  );
}