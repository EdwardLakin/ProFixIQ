// features/ai/components/ChatDock.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { FiBell, FiPlus, FiX } from "react-icons/fi";

import ConversationList from "@/features/ai/components/chat/ConversationList";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

type DB = Database;

export default function ChatDock({
  context_type = null,
  context_id = null,
}: {
  /** e.g., "work_order" | "inspection" | "parts_request" */
  context_type?: string | null;
  /** the specific id for that context (uuid/string) */
  context_id?: string | null;
}) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [userId, setUserId] = useState<string | null>(null);

  // UI state
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string>("");

  // Unread badge (best-effort; will gracefully show 0 if schema doesn’t match)
  const [unread, setUnread] = useState<number>(0);

  // Load user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  // If a context is supplied, try to preselect a matching conversation
  useEffect(() => {
    if (!userId || !context_type || !context_id) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: convs } = await supabase
          .from("conversations")
          .select("id")
          .eq("context_type", context_type)
          .eq("context_id", context_id);

        if (!convs?.length) return;

        const ids = convs.map((c) => c.id);
        const { data: mine } = await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .in("conversation_id", ids)
          .eq("user_id", userId);

        const first = mine?.[0]?.conversation_id;
        if (!cancelled && first) setActiveConversationId(first);
      } catch {
        /* ignore – context preselect is best-effort */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId, context_type, context_id]);

  // ----- Unread badge logic (defensive) -----
  // Looks for a typical schema:
  // - conversation_participants(conversation_id, user_id, last_read_at)
  // - messages(id, conversation_id, created_at, sender_id, content)
  const refreshUnread = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id,last_read_at")
        .eq("user_id", userId);

      if (!parts?.length) {
        setUnread(0);
        return;
      }

      const convIds = parts.map((p) => p.conversation_id).filter(Boolean);
      if (!convIds.length) {
        setUnread(0);
        return;
      }

      // Pull the latest messages across those conversations
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id,created_at,sender_id")
        .in("conversation_id", convIds);

      if (!msgs?.length) {
        setUnread(0);
        return;
      }

      // Count messages newer than last_read_at (and not sent by me)
      const lastReadByConv = new Map<string, string | null>();
      for (const p of parts) lastReadByConv.set(p.conversation_id, (p as any).last_read_at ?? null);

      let count = 0;
      for (const m of msgs) {
        const lr = lastReadByConv.get(m.conversation_id) ?? null;
        const newer =
          !lr || (new Date(m.created_at).getTime() > new Date(lr).getTime());
        if (newer && m.sender_id !== userId) count++;
      }
      setUnread(count);
    } catch {
      // If the schema differs, fail silently; show no badge rather than erroring the UI
      setUnread(0);
    }
  }, [supabase, userId]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  // Optional realtime: bump unread on new messages
  useEffect(() => {
    if (!userId) return;
    try {
      const channel = supabase
        .channel("chatdock-unread")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          () => refreshUnread(),
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    } catch {
      /* ignore */
    }
  }, [supabase, userId, refreshUnread]);

  if (!userId) return null; // hide dock if not signed in

  return (
    <>
      {/* Trigger + New */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative inline-flex items-center gap-2 rounded border border-white/15 bg-neutral-900 px-3 py-1 text-sm hover:border-orange-500"
          aria-label="Open team chat"
          title="Team Chat"
        >
          <FiBell className="opacity-90" />
          <span>Team Chat</span>
          {unread > 0 && (
            <span
              className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full
                         bg-orange-500 px-1 text-xs font-bold text-black"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-black hover:bg-orange-700"
          aria-label="Start a new conversation"
          title="New conversation"
        >
          <FiPlus />
          New
        </button>
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50">
          {/* backdrop */}
          <button
            className="absolute inset-0 bg-black/60"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-5xl border-l border-neutral-800
                       bg-neutral-900 text-white shadow-[0_0_30px_rgba(0,0,0,0.65)]"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
              <div className="flex items-center gap-2">
                <FiBell className="text-orange-400" />
                <h2 className="text-sm font-semibold text-neutral-200">Team Chat</h2>
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-black">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewOpen(true)}
                  className="rounded border border-white/15 px-2 py-1 text-xs hover:border-orange-500"
                >
                  + New
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded border border-white/15 px-2 py-1 text-xs hover:border-orange-500"
                  aria-label="Close"
                  title="Close"
                >
                  <FiX />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex h-[calc(100%-40px)]">
              {/* Left: conversation list */}
              <div className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 p-3">
                <ConversationList
                  activeConversationId={activeConversationId}
                  setActiveConversationId={(id) => {
                    setActiveConversationId(id);
                    // When a convo is opened, try refreshing unread
                    void refreshUnread();
                  }}
                />
              </div>

              {/* Right: message window */}
              <div className="flex-1 overflow-hidden">
                {activeConversationId ? (
                  <ChatWindow
                    conversationId={activeConversationId}
                    userId={userId}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-neutral-400">
                    <div className="text-center">
                      <p className="mb-2">Select a conversation</p>
                      <p className="text-sm">
                        or{" "}
                        <button
                          onClick={() => setNewOpen(true)}
                          className="underline decoration-orange-500 underline-offset-4 hover:text-orange-400"
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
          </aside>
        </div>
      )}

      {/* New chat modal — context-aware */}
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
          // new thread created → unread resets for me
          setUnread((n) => n); // no-op; keep it simple here
        }}
      />
    </>
  );
}