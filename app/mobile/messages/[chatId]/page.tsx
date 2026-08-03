"use client";

import { ChevronLeft, MessageCircle } from "lucide-react";
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
    <main className="flex min-h-[calc(100dvh-3.75rem-env(safe-area-inset-top,0px))] flex-col overflow-hidden">
      <header className="flex min-h-16 items-center gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 shadow-sm">
        <Link
          href="/mobile/messages"
          aria-label="Return to messages"
          className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </Link>
        <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-300">
          <MessageCircle aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
            {title}
          </h1>
          <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
            Team conversation
          </p>
        </div>
      </header>

      {!userId ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="mobile-command-panel w-full max-w-sm border p-5 text-center text-sm text-[color:var(--theme-text-secondary)]">
            Loading conversation…
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-[color:var(--theme-surface-page)] p-2 sm:p-3">
          <div className="mobile-command-panel mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden border">
            <ChatWindow
              conversationId={conversationId}
              userId={userId}
              title={title}
            />
          </div>
        </div>
      )}
    </main>
  );
}
