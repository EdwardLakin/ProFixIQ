"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronRight, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ConversationRow = {
  conversation: DB["public"]["Tables"]["conversations"]["Row"];
  latest_message: DB["public"]["Tables"]["messages"]["Row"] | null;
  participants: Array<{
    id: string;
    user_id: string;
    full_name: string | null;
  }>;
  unread_count: number;
};

export default function MobileMessagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const response = await fetch("/api/chat/my-conversations", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to load conversations (${response.status})`);
      }

      const data = (await response.json()) as ConversationRow[];
      setRows(data ?? []);
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Failed to load conversations.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const interval = window.setInterval(() => void loadConversations(), 30_000);
    window.addEventListener("profixiq:inbox-refresh", loadConversations);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("profixiq:inbox-refresh", loadConversations);
    };
  }, [loadConversations]);

  const unreadTotal = rows.reduce((sum, row) => sum + row.unread_count, 0);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">
              Shop communication
            </div>
            <h1 className="mobile-dashboard-hero__title">Team chat</h1>
            <p className="mobile-dashboard-hero__subtitle">
              {unreadTotal > 0
                ? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"} need your attention.`
                : "Messages, work-order context and shop updates in one inbox."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/mobile/messages/new")}
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white active:scale-95"
            aria-label="Start a new chat"
          >
            <Plus aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </section>

      {err ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {err}
        </div>
      ) : null}

      <section className="mobile-command-panel overflow-hidden border">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[color:var(--theme-text-primary)]">
              Conversations
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Most recent activity first.
            </p>
          </div>
          <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-xs font-bold text-[color:var(--theme-text-secondary)]">
            {rows.length}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl bg-[color:var(--theme-surface-subtle)]"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-6 text-center">
            <div>
              <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-[color:var(--accent-copper)]">
                <MessageCircle aria-hidden className="h-6 w-6" />
              </span>
              <h2 className="mt-3 text-base font-bold text-[color:var(--theme-text-primary)]">
                No conversations yet
              </h2>
              <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                Start a chat with someone in the shop.
              </p>
              <button
                type="button"
                onClick={() => router.push("/mobile/messages/new")}
                className="mobile-command-primary mt-4 inline-flex items-center justify-center gap-2 px-4 text-sm font-bold"
              >
                <Plus aria-hidden className="h-4 w-4" />
                New chat
              </button>
            </div>
          </div>
        ) : (
          <div>
            {rows.map((row) => {
              const {
                conversation,
                latest_message: latestMessage,
                participants,
                unread_count: unreadCount,
              } = row;
              const href = `/mobile/messages/${conversation.id}`;
              const preview =
                latestMessage?.content?.slice(0, 100) ?? "No messages yet.";
              const timestamp =
                latestMessage?.created_at ?? conversation.created_at;
              const when = timestamp
                ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
                : "";
              const participantNames = participants
                .map((participant) => participant.full_name)
                .filter((name): name is string => Boolean(name));
              const title =
                conversation.title ??
                (participantNames.join(", ") ||
                  `Conversation ${conversation.id.slice(0, 6)}`);

              return (
                <Link
                  key={conversation.id}
                  href={href}
                  className="flex min-h-[5.35rem] items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3 last:border-b-0 active:bg-[color:var(--theme-surface-hover)]"
                >
                  <span className="relative inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-sm font-extrabold text-[color:var(--accent-copper)]">
                    {title.slice(0, 1).toUpperCase()}
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-grid min-h-5 min-w-5 place-items-center rounded-full bg-[color:var(--accent-copper)] px-1 text-[0.6rem] font-extrabold text-white ring-2 ring-[color:var(--theme-surface-panel)]">
                        {unreadCount}
                      </span>
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-[color:var(--theme-text-primary)]">
                        {title}
                      </span>
                      <span className="shrink-0 text-[0.62rem] text-[color:var(--theme-text-muted)]">
                        {when}
                      </span>
                    </span>
                    <span
                      className={`mt-1 block truncate text-xs ${
                        unreadCount > 0
                          ? "font-semibold text-[color:var(--theme-text-primary)]"
                          : "text-[color:var(--theme-text-secondary)]"
                      }`}
                    >
                      {preview}
                    </span>
                  </span>

                  <ChevronRight
                    aria-hidden
                    className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
