"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { MobileShell } from "components/layout/MobileShell";
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
    <MobileShell>
      <div className="flex h-full flex-col px-4 py-3">
        {/* Top bar */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
          >
            ← Back
          </button>
          <div className="min-w-0 text-right">
            <h1 className="truncate text-sm font-blackops uppercase tracking-[0.18em] text-neutral-200">
              {title}
            </h1>
            <p className="mt-0.5 text-[0.65rem] text-neutral-500">
              Chat
            </p>
          </div>
        </div>

        {/* Chat window */}
        {!userId ? (
          <div className="mt-4 rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
            Loading…
          </div>
        ) : (
          <div className="flex-1">
            <ChatWindow
              conversationId={conversationId}
              userId={userId}
              title={title}
            />
          </div>
        )}
      </div>
    </MobileShell>
  );
}