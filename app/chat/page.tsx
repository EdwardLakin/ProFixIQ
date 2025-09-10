"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

export default function ChatThreadPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const params = useParams();
  const chatId = String(params?.chatId ?? "");

  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [participants, setParticipants] = useState<Pick<Profile, "id" | "full_name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // Load history + participants
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error || !data) {
        if (mounted) {
          setMessages([]);
          setParticipants([]);
          setLoading(false);
        }
        return;
      }

      const rows = data as MessageRow[];
      const ids = new Set<string>();
      rows.forEach((m) => {
        if (m.sender_id) ids.add(m.sender_id);
        (m.recipients ?? []).forEach((r) => ids.add(String(r)));
      });

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(ids));

      if (mounted) {
        setMessages(rows);
        setParticipants((profs ?? []) as any);
        setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [supabase, chatId]);

  // Realtime updates for this chat
  useEffect(() => {
    const channel = supabase
      .channel(`thread-${chatId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => [...prev, row]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, chatId]);

  async function send() {
    if (!me || sending) return;
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    // keep recipients from the latest message (simple convention)
    const latest = messages[messages.length - 1];
    const recipients = (latest?.recipients ?? []) as string[];

    setSending(true);
    try {
      await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: me,
        recipients,
        content: text,
      });
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setSending(false);
    }
  }

  const title =
    participants.length > 0
      ? participants.map((p) => p.full_name ?? "User").join(", ")
      : `Chat ${chatId.slice(0, 8)}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col p-4 text-white">
      <div className="mb-3">
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>

      <div className="min-h-[40vh] flex-1 rounded border border-neutral-800 bg-neutral-900 p-3">
        {loading ? (
          <div className="text-neutral-400">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-neutral-400">No messages yet.</div>
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

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
          placeholder="Type a message…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="rounded bg-orange-600 px-4 py-2 font-semibold text-black disabled:opacity-60"
          onClick={() => void send()}
          disabled={sending}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}