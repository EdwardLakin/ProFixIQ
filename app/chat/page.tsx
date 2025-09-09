"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ConversationList from "@/features/ai/components/chat/ConversationList";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

export default function TeamChatPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  if (!userId) {
    return (
      <div className="p-6 text-neutral-300">Loading chat…</div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-140px)] rounded border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Left: conversation list */}
      <div className="w-72 border-r border-neutral-800 p-3 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Team Chat</h2>
          <button
            onClick={() => setNewOpen(true)}
            className="text-xs rounded border border-white/15 px-2 py-1 hover:border-orange-500"
          >
            + New
          </button>
        </div>

        <ConversationList
          activeConversationId={activeConversationId}
          setActiveConversationId={setActiveConversationId}
        />
      </div>

      {/* Right: message window */}
      <div className="flex-1 p-3">
        {activeConversationId ? (
          <ChatWindow conversationId={activeConversationId} userId={userId} />
        ) : (
          <div className="h-full grid place-items-center text-neutral-400">
            <div className="text-center">
              <p className="mb-2">Select a conversation</p>
              <p className="text-sm">
                or{" "}
                <button
                  onClick={() => setNewOpen(true)}
                  className="underline hover:text-orange-400"
                >
                  start a new one
                </button>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      {/* New chat modal */}
      <NewChatModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        created_by={userId}
        context_type={null}
        context_id={null}
        onCreated={(conversationId) => {
          setActiveConversationId(conversationId);
          setNewOpen(false);
        }}
      />
    </div>
  );
}