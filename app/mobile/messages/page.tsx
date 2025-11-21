"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { MobileShell } from "components/layout/MobileShell";
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
    <MobileShell>
      <div className="px-4 py-4 space-y-4 text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-200">
            Messages
          </h1>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-[0.7rem] text-neutral-200 hover:border-orange-400 hover:bg-neutral-800"
          >
            Dashboard
          </button>
        </div>

        {err && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-4 text-sm text-neutral-300">
            Loading conversations…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/40 px-3 py-6 text-sm text-neutral-400">
            No conversations yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const {
                conversation,
                latest_message,
                participants,
                unread_count,
              } = row;

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

              const participantTitle =
                participantNames.length > 0
                  ? participantNames.join(", ")
                  : null;

              const title =
                conversation.title ??
                participantTitle ??
                `Conversation ${conversation.id.slice(0, 6)}`;

              return (
                <Link
                  key={conversation.id}
                  href={href}
                  className="flex items-start justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-3 text-sm text-neutral-100 shadow-sm shadow-black/30 hover:border-orange-500/70 hover:bg-neutral-900/80"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-neutral-50">
                        {title}
                      </span>
                      {unread_count > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1 text-[0.65rem] font-semibold text-black">
                          {unread_count}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[0.75rem] text-neutral-300">
                      {preview}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 text-[0.65rem] text-neutral-500">
                    {when}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </MobileShell>
  );
}