// app/chat/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

type ApiConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  unread_count: number;
};

export default function ChatListPage(): JSX.Element {
  const [conversations, setConversations] = useState<ApiConversationPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  async function fetchConversations(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/chat/my-conversations", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        setConversations([]);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as ApiConversationPayload[];

      // newest first
      data.sort((a, b) => {
        const at =
          a.latest_message?.sent_at ??
          a.conversation.created_at ??
          "";
        const bt =
          b.latest_message?.sent_at ??
          b.conversation.created_at ??
          "";
        return bt.localeCompare(at);
      });

      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    void fetchConversations();
  }, []);

  // realtime-ish refresh: listen to the server via pusher/supabase?
  // we already have an API that is safe, so just poll on inserts from supabase
  useEffect(() => {
    const ev = new EventSource("/api/realtime/placeholder"); // you can remove this if you don't have it
    return () => {
      ev.close();
    };
  }, []);

  return (
    <PageShell title="Conversations">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">
          Conversations
        </h1>
        <button
          type="button"
          onClick={() => setIsNewChatOpen(true)}
          className="inline-flex items-center rounded border border-orange-500/70 bg-transparent px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
        >
          New conversation
        </button>
      </div>

      {loading ? (
        <div className="rounded border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : conversations.length === 0 ? (
        <div className="rounded border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
          No conversations yet. Start one!
        </div>
      ) : (
        <ul className="divide-y divide-border/40 rounded border border-border/60 bg-background/20">
          {conversations.map((item) => {
            const conv = item.conversation;
            const title = conv.context_type
              ? `${conv.context_type}: ${conv.id.slice(0, 6)}`
              : `Conversation ${conv.id.slice(0, 6)}`;

            const preview =
              item.latest_message?.content?.slice(0, 140) ??
              "No messages yet";

            return (
              <li
                key={conv.id}
                className="p-3 hover:bg-muted/30 transition-colors"
              >
                <Link href={`/chat/${conv.id}`} className="block">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {title}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground truncate max-w-[320px]">
                        {preview}
                      </div>
                    </div>
                    {item.unread_count > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                        {item.unread_count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onCreated={() => {
          // pull the fresh list right after the modal creates one
          void fetchConversations();
        }}
      />
    </PageShell>
  );
}