"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";

type DB = Database;

type ConversationPayload = {
  conversation: DB["public"]["Tables"]["conversations"]["Row"];
  latest_message: DB["public"]["Tables"]["messages"]["Row"] | null;
  participants: Array<{ id: string; full_name: string | null }>;
  unread_count: number;
};

export default function ChatThreadPage(): JSX.Element {
  const params = useParams<{ chatId: string }>();
  const conversationId = params.chatId;

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("Conversation");

  // who am I
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);

      // fetch conversations and try to label nicely
      try {
        const res = await fetch("/api/chat/my-conversations", {
          method: "GET",
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as ConversationPayload[];
          const found = data.find(
            (item) => item.conversation.id === conversationId,
          );
          if (found) {
            const others =
              user?.id == null
                ? found.participants
                : found.participants.filter((p) => p.id !== user.id);
            const label =
              others[0]?.full_name ??
              found.conversation.context_type ??
              `Conversation ${conversationId.slice(0, 6)}`;
            setTitle(label);
          }
        }
      } catch {
        // ignore — we'll keep "Conversation"
      }
    })();
  }, [supabase, conversationId]);

  return (
    <PageShell title={title}>
      {!userId ? (
        <div className="rounded border border-[#3b2a21] bg-[#0b0806] p-4 text-sm text-[#d5b9a0]">
          Loading…
        </div>
      ) : (
        <div className="h-[70vh]">
          <ChatWindow
            conversationId={conversationId}
            userId={userId}
            title={title}
          />
        </div>
      )}
    </PageShell>
  );
}