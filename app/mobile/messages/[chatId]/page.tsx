"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import ChatWindow from "@/features/ai/components/chat/ChatWindow";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

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
  const conversationId = params.chatId;
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [title, setTitle] = useState("Conversation");

  useEffect(() => {
    let active = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserId = user?.id ?? null;
      if (!active) return;
      setUserId(currentUserId);

      try {
        const response = await fetch("/api/chat/my-conversations", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as ConversationPayload[];
        const found = data.find(
          (item) => item.conversation.id === conversationId,
        );
        if (!found || !active) return;

        const others =
          currentUserId == null
            ? found.participants
            : found.participants.filter(
                (participant) => participant.id !== currentUserId,
              );
        setTitle(
          others[0]?.full_name ??
            found.conversation.context_type ??
            found.conversation.title ??
            `Conversation ${conversationId.slice(0, 6)}`,
        );
      } catch {
        // Keep the generic title when the conversation list is unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, [conversationId, supabase]);

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-3 text-foreground">
      <div className="metal-bar mb-3 flex items-center justify-between gap-2 border-b border-[var(--metal-border-soft)] pb-2">
        <Link
          href="/mobile/messages"
          className="inline-flex items-center rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)]"
        >
          ← Messages
        </Link>
        <div className="min-w-0 text-right">
          <h1 className="truncate text-sm font-blackops uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
            {title}
          </h1>
          <p className="mt-0.5 text-[0.65rem] text-[color:var(--theme-text-muted)]">
            Chat
          </p>
        </div>
      </div>

      {!userId ? (
        <div className="metal-card mt-4 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading…
        </div>
      ) : (
        <div className="metal-panel metal-panel--card flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2">
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
