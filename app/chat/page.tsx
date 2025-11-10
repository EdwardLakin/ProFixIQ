// app/chat/page.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";

type DB = Database;

type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];

type ParticipantInfo = {
  id: string;
  full_name: string | null;
};

type ConversationWithMeta = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: ParticipantInfo[];
  unread_count: number;
};

export default function ChatListPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [me, setMe] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [search, setSearch] = useState("");

  // who am I
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMe(user?.id ?? null);
    })();
  }, [supabase]);

  // load conversations
  const loadConversations = useCallback(async () => {
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
      const data = (await res.json()) as ConversationWithMeta[];
      setConversations(data);
    } catch (err) {
      console.error("[/chat] failed to load conversations:", err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // live refresh
  useEffect(() => {
    const channel = supabase
      .channel("chat-page-refresh")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void loadConversations();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        () => {
          void loadConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadConversations]);

  // filtered
  const filtered = conversations.filter((item) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;

    const titleParts: string[] = [];
    if (item.conversation.context_type) {
      titleParts.push(item.conversation.context_type);
    }
    item.participants.forEach((p) => {
      if (p.full_name) {
        titleParts.push(p.full_name);
      }
    });
    const latest = item.latest_message?.content ?? "";

    return (
      titleParts.join(" ").toLowerCase().includes(term) ||
      latest.toLowerCase().includes(term)
    );
  });

  return (
    <PageShell title="Conversations">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            Conversations
          </h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded border border-border/50 bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-orange-400 focus:outline-none"
          />
        </div>
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
      ) : filtered.length === 0 ? (
        <div className="rounded border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
          No conversations yet. Start one!
        </div>
      ) : (
        <ul className="divide-y divide-border/40 rounded border border-border/60 bg-background/20">
          {filtered.map((item) => {
            const conv = item.conversation;
            const latest = item.latest_message;
            const others =
              me == null
                ? item.participants
                : item.participants.filter((p) => p.id !== me);

            const nameLabel =
              others[0]?.full_name ??
              conv.context_type ??
              `Conversation ${conv.id.slice(0, 6)}`;

            const preview =
              latest?.content?.slice(0, 140) ?? "No messages yet";

            return (
              <li
                key={conv.id}
                className="p-3 hover:bg-muted/30 transition-colors"
              >
                <Link href={`/chat/${conv.id}`} className="block">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {nameLabel}
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

      {/* keep this placeholder so the state doesn't break */}
      {isNewChatOpen ? <div /> : null}
    </PageShell>
  );
}