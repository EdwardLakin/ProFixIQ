// features/ai/components/ChatDock.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import ConversationList from "@/features/ai/components/chat/ConversationList";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";


export default function ChatDock({
  context_type = null,
  context_id = null,
}: {
  /** e.g., "work_order" | "inspection" | "parts_request" */
  context_type?: string | null;
  /** the specific id for that context (uuid/string) */
  context_id?: string | null;
}) {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const [userId, setUserId] = useState<string | null>(null);

  // UI state
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string>("");

  // Load user
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  // If a context is supplied, see if there’s already a conversation for it
  // that this user participates in; if so, preselect it.
  useEffect(() => {
    if (!userId || !context_type || !context_id) return;

    let cancelled = false;
    (async () => {
      // find conversations matching the context where user is a participant
      const { data: convs, error } = await supabase
        .from("conversations")
        .select("id")
        .eq("context_type", context_type)
        .eq("context_id", context_id);

      if (error || !convs?.length) return;

      const ids = convs.map((c) => c.id);
      const { data: mine } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .in("conversation_id", ids)
        .eq("user_id", userId);

      const first = mine?.[0]?.conversation_id;
      if (!cancelled && first) {
        setActiveConversationId(first);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId, context_type, context_id]);

  if (!userId) return null; // hide dock if not signed in

  return (
    <>
      {/* Header buttons (trigger + "new") */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-neutral-800 border border-white/15 px-3 py-1 text-sm hover:border-orange-500"
          aria-label="Open team chat"
          title="Open team chat"
        >
          Chat
        </button>

        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold hover:bg-orange-700"
        >
          New
        </button>
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-40">
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/60"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-5xl bg-neutral-900 text-white border-l border-neutral-800 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-full">
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
                  <ChatWindow
                    conversationId={activeConversationId}
                    userId={userId}
                  />
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
            </div>

            {/* Drawer header */}
            <div className="absolute right-0 top-0 p-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded border border-white/15 px-2 py-1 text-xs hover:border-orange-500"
              >
                Close
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* New chat modal — now context-aware */}
      <NewChatModal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        created_by={userId}
        context_type={context_type}
        context_id={context_id}
        onCreated={(conversationId) => {
          setActiveConversationId(conversationId);
          setNewOpen(false);
          setOpen(true);
        }}
      />
    </>
  );
}