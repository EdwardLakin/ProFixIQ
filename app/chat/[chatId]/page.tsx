"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";

type DB = Database;

export default function ChatThreadPage(): JSX.Element {
  // this will be the value from /chat/<id>
  const params = useParams<{ chatId: string }>();
  const conversationId = params.chatId;

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);

  // who am I
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  return (
    <PageShell title="Conversation">
      {!userId ? (
        <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
          Loading…
        </div>
      ) : (
        <div className="h-[70vh]">
          {/* re-use the working window that uses /api/chat/get-messages */}
          <ChatWindow
            conversationId={conversationId}
            userId={userId}
            title="Conversation"
          />
        </div>
      )}
    </PageShell>
  );
}