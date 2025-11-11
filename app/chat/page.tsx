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
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

type DB = Database;

type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];

type ParticipantInfo = {
  id: string;
  full_name: string | null;
};

type ConversationWithMeta = {
  conversation: ConversationRow;
  latest_message: DB["public"]["Tables"]["messages"]["Row"] | null;
  participants: ParticipantInfo[];
  unread_count: number;
};

function formatRelative(dateIso: string | null): string {
  if (!dateIso) return "";
  const date = new Date(dateIso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}

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

  // delete conversation (optimistic, then rollback on error)
  const handleDelete = useCallback(async (id: string) => {
    // optimistic: remove immediately
    let prev: ConversationWithMeta[] = [];
    setConversations((curr) => {
      prev = curr;
      return curr.filter((c) => c.conversation.id !== id);
    });

    try {
      const res = await fetch("/api/chat/delete-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        console.error("[/chat] delete failed:", await res.text());
        // rollback
        setConversations(prev);
      }
    } catch (err) {
      console.error("[/chat] delete failed:", err);
      setConversations(prev);
    }
  }, []);

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
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-foreground placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsNewChatOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-orange-500/70 bg-transparent px-4 py-2 text-sm font-medium text-orange-200 hover:bg-orange-500/10 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
        >
          <span className="text-base leading-none">＋</span>
          New conversation
        </button>
      </div>

      {loading ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border/60 bg-muted/5 py-10 text-center text-sm text-muted-foreground">
          <p>No conversations yet.</p>
          <button
            type="button"
            onClick={() => setIsNewChatOpen(true)}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-orange-400"
          >
            Start a conversation
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-800/70 bg-neutral-950/40 shadow-sm">
          <ul className="divide-y divide-neutral-800/70">
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

              const timeLabel =
                formatRelative(
                  latest?.sent_at ??
                    latest?.created_at ??
                    conv.created_at ??
                    null,
                ) || "";

              const initials =
                nameLabel && nameLabel.length > 0
                  ? nameLabel.charAt(0).toUpperCase()
                  : "C";

              const participantNames =
                others.length > 1
                  ? others
                      .slice(0, 3)
                      .map((p) => p.full_name ?? "User")
                      .join(", ") +
                    (others.length > 3 ? "…" : "")
                  : null;

              return (
                <li key={conv.id} className="flex items-center gap-3 px-3 py-3">
                  {/* clickable part */}
                  <Link
                    href={`/chat/${conv.id}`}
                    className="flex flex-1 items-center gap-3 hover:bg-neutral-900/30 rounded-md px-1 py-1 transition-colors"
                  >
                    {/* avatar */}
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/90 text-sm font-semibold text-black">
                      {initials}
                    </div>

                    {/* main */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {nameLabel}
                        </p>
                        {item.unread_count > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-black">
                            {item.unread_count}
                          </span>
                        ) : null}
                      </div>
                      {participantNames ? (
                        <p className="mt-0.5 line-clamp-1 text-[10px] text-neutral-400">
                          {participantNames}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-1 text-xs text-neutral-400">
                        {preview}
                      </p>
                    </div>

                    {/* right */}
                    <div className="flex flex-col items-end gap-1">
                      {timeLabel ? (
                        <span className="text-[10px] text-neutral-500">
                          {timeLabel}
                        </span>
                      ) : null}
                    </div>
                  </Link>

                  {/* delete always visible */}
                  <button
                    type="button"
                    onClick={() => void handleDelete(conv.id)}
                    className="ml-2 rounded-md border border-red-500/50 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        onCreated={() => {
          void loadConversations();
        }}
      />
    </PageShell>
  );
}