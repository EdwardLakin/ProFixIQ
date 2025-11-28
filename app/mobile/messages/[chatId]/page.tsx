"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";

type DB = Database;

type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type Participant = { id: string; full_name: string | null };

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: DB["public"]["Tables"]["messages"]["Row"] | null;
  participants: Participant[];
  unread_count: number;
};

export default function MobileChatThreadPage() {
  const params = useParams<{ chatId: string }>();
  const router = useRouter();
  const conversationId = params.chatId;

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Conversation");

  // who am I + build a nice title
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setUserId(uid);

      try {
        const res = await fetch("/api/chat/my-conversations", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) return;

        const data = (await res.json()) as ConversationPayload[];
        const found = data.find(
          (item) => item.conversation.id === conversationId,
        );
        if (!found) return;

        const others =
          uid == null
            ? found.participants
            : found.participants.filter((p) => p.id !== uid);

        const label =
          others[0]?.full_name ??
          found.conversation.context_type ??
          found.conversation.title ??
          `Conversation ${conversationId.slice(0, 6)}`;

        setTitle(label);
      } catch {
        // keep default title
      }
    })();
  }, [supabase, conversationId]);

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-3 text-foreground">
      {/* Top bar */}
      <div className="metal-bar mb-3 flex items-center justify-between gap-2 border-b border-[var(--metal-border-soft)] pb-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1 text-xs text-neutral-200 shadow-[0_4px_10px_rgba(0,0,0,0.7)] hover:bg-black/80"
        >
          ← Back
        </button>
        <div className="min-w-0 text-right">
          <h1 className="truncate text-sm font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
            {title}
          </h1>
          <p className="mt-0.5 text-[0.65rem] text-neutral-500">Chat</p>
        </div>
      </div>

      {/* Chat window */}
      {!userId ? (
        <div className="metal-card mt-4 rounded-xl border border-[var(--metal-border-soft)] bg-black/40 p-4 text-sm text-neutral-300">
          Loading…
        </div>
      ) : (
        <div className="metal-panel metal-panel--card flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--metal-border-soft)] bg-black/40 px-2 py-2">
          <ChatWindow
            conversationId={conversationId}
            userId={userId}
            title={title}
          />
        </div>
      )}
    </div>
  );
}