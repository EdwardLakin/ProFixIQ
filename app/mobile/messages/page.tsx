// app/mobile/messages/page.client.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ConversationRow = {
  conversation: DB["public"]["Tables"]["conversations"]["Row"];
  latest_message: DB["public"]["Tables"]["messages"]["Row"] | null;
  participants: Array<{ id: string; full_name: string | null }>;
  unread_count: number;
};

export default function MobileMessagesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/chat/my-conversations", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed to load conversations (${res.status})`);
        }

        const data = (await res.json()) as ConversationRow[];
        setRows(data ?? []);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to load conversations.";
        setErr(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-4 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-blackops text-lg uppercase tracking-[0.16em] text-neutral-200">
            Messages
          </h1>

          <button
            type="button"
            onClick={() => router.push("/mobile/messages/new")}
            className="
              rounded-full border border-[var(--accent-copper-soft)]
              bg-black/60 px-3 py-1 text-[0.7rem] font-semibold
              text-[var(--accent-copper-soft)]
              shadow-[0_10px_20px_rgba(0,0,0,0.65)]
              hover:bg-black/80 hover:border-[var(--accent-copper)]
            "
          >
            New chat
          </button>
        </div>

        {/* Error */}
        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="metal-card rounded-xl border border-[var(--metal-border-soft)] px-3 py-4 text-sm text-neutral-300">
            Loading conversations…
          </div>
        ) : rows.length === 0 ? (
          // Empty state
          <div className="metal-card rounded-xl border border-dashed border-[var(--metal-border-soft)] px-3 py-6 text-sm text-neutral-400 text-center">
            No conversations yet.
            <br />
            Tap <span className="text-[var(--accent-copper-soft)]">New chat</span> to begin.
          </div>
        ) : (
          // List
          <div className="space-y-3">
            {rows.map((row) => {
              const { conversation, latest_message, participants, unread_count } = row;

              const href = `/mobile/messages/${conversation.id}`;
              const preview =
                latest_message?.content?.slice(0, 80) ?? "No messages yet.";

              const ts = latest_message?.created_at ?? conversation.created_at;
              const when = ts
                ? formatDistanceToNow(new Date(ts), { addSuffix: true })
                : "";

              const participantNames = participants
                .map((p) => p.full_name)
                .filter((name): name is string => Boolean(name));

              const title =
                conversation.title ??
                participantNames.join(", ") ||
                `Conversation ${conversation.id.slice(0, 6)}`;

              return (
                <Link
                  key={conversation.id}
                  href={href}
                  className="
                    metal-card relative flex items-start gap-3 rounded-xl 
                    border border-[var(--metal-border-soft)]
                    bg-[var(--metal-surface)] px-3 py-3
                    hover:border-[var(--accent-copper-soft)]
                    hover:shadow-[0_0_18px_rgba(255,125,0,0.25)]
                    transition
                  "
                >
                  {/* Copper glow line */}
                  <div className="
                    absolute top-0 left-0 right-0 h-[2px]
                    bg-gradient-to-r from-[var(--accent-copper-soft)]/40
                    via-[var(--accent-copper)]/70
                    to-[var(--accent-copper-soft)]/40
                    rounded-t-xl
                  " />

                  {/* Avatar chip */}
                  <div className="
                    mt-1 flex h-8 w-8 shrink-0 items-center justify-center
                    rounded-full border border-[var(--accent-copper-soft)]
                    bg-black/50 text-[0.7rem] font-semibold text-[var(--accent-copper-soft)]
                    shadow-[0_0_8px_rgba(255,125,0,0.25)]
                  ">
                    {title.slice(0, 1).toUpperCase()}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-neutral-50">
                        {title}
                      </span>

                      {unread_count > 0 && (
                        <span
                          className="
                            inline-flex h-5 min-w-[20px] items-center justify-center
                            rounded-full bg-[var(--accent-copper-soft)]
                            px-1 text-[0.65rem] font-bold text-black
                          "
                        >
                          {unread_count}
                        </span>
                      )}
                    </div>

                    <p className="truncate text-[0.75rem] text-neutral-300">
                      {preview}
                    </p>
                  </div>

                  <span className="shrink-0 pt-1 text-[0.65rem] text-neutral-500">
                    {when}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}