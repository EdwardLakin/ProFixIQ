"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import { getUserConversations } from "@ai/lib/chat/getUserConversations";

type DB = Database;

type Conversation = DB["public"]["Tables"]["conversations"]["Row"];
type Message = DB["public"]["Tables"]["messages"]["Row"];

type ConversationWithMeta = Conversation & {
  latest_message?: Message | null;
  unread_count: number;
};

export default function ChatListPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getUserConversations(supabase);
        if (!cancelled) {
          // newest first
          result.sort((a, b) => {
            const at = a.latest_message?.sent_at || a.created_at || "";
            const bt = b.latest_message?.sent_at || b.created_at || "";
            return bt.localeCompare(at);
          });
          setConversations(result);
        }
      } catch (err) {
        console.error("[/chat] failed to load conversations:", err);
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // live refresh when a message or conversation is inserted
  useEffect(() => {
    const channel = supabase
      .channel("chat-page-refresh")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async () => {
          try {
            const result = await getUserConversations(supabase);
            result.sort((a, b) => {
              const at = a.latest_message?.sent_at || a.created_at || "";
              const bt = b.latest_message?.sent_at || b.created_at || "";
              return bt.localeCompare(at);
            });
            setConversations(result);
          } catch (err) {
            console.warn("[/chat] refresh after message failed:", err);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        async () => {
          try {
            const result = await getUserConversations(supabase);
            result.sort((a, b) => {
              const at = a.latest_message?.sent_at || a.created_at || "";
              const bt = b.latest_message?.sent_at || b.created_at || "";
              return bt.localeCompare(at);
            });
            setConversations(result);
          } catch (err) {
            console.warn("[/chat] refresh after conversation failed:", err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

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
          {conversations.map((conv) => {
            const title = conv.context_type
              ? `${conv.context_type}: ${conv.id.slice(0, 6)}`
              : `Conversation ${conv.id.slice(0, 6)}`;

            const preview =
              conv.latest_message?.content?.slice(0, 140) ??
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
                    {conv.unread_count > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-black">
                        {conv.unread_count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* modal for starting a chat — uses your working NewChatModal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        // when a convo is created in the modal, refresh this list right away
        onCreated={() => {
          // refetch conversations
          (async () => {
            try {
              const result = await getUserConversations(supabase);
              result.sort((a, b) => {
                const at = a.latest_message?.sent_at || a.created_at || "";
                const bt = b.latest_message?.sent_at || b.created_at || "";
                return bt.localeCompare(at);
              });
              setConversations(result);
            } catch (err) {
              console.warn("[/chat] refresh after modal create failed:", err);
            }
          })();
        }}
      />
    </PageShell>
  );
}