// features/ai/components/chat/NewChatModal.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
// import type { Database } from "@shared/types/types/supabase"; // ← not needed right now

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "tech", label: "Tech" },
  { value: "advisor", label: "Advisor" },
  { value: "parts", label: "Parts" },
  { value: "foreman", label: "Foreman" },
  { value: "lead_hand", label: "Lead hand" },
] as const;

type UserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  email?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  content: string | null;
  sent_at: string | null;
  recipients?: string[] | null;
};

// we no longer read full conversations from the table (that was 500’ing)
// we just keep the ids from the view
type MyConversation = {
  id: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  created_by?: string;
  context_type?: string | null;
  context_id?: string | null;
  activeConversationId?: string | null;
};

const LOCAL_KEY = "pfq-chat-last-conversation";

export default function NewChatModal({
  isOpen,
  onClose,
  onCreated,
  created_by,
  context_type = null,
  context_id = null,
  activeConversationId: forcedConversationId = null,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  // who am I
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // left pane
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | string>("all");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // right pane
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendText, setSendText] = useState("");

  // convo switcher (just ids)
  const [myConversations, setMyConversations] = useState<MyConversation[]>([]);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // load current user & role
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        setCurrentUserRole(profile?.role ?? null);
      }
    })();
  }, [supabase]);

  // fetch convo ids from the SAFE VIEW (no more 500)
  const loadMyConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("v_my_conversation_ids")
      .select("conversation_id");
    if (error) {
      console.warn("[NewChatModal] v_my_conversation_ids failed:", error);
      return;
    }
    const list: MyConversation[] =
      data?.map((row: { conversation_id: string }) => ({
        id: row.conversation_id,
      })) ?? [];
    setMyConversations(list);
  }, [supabase]);

  // when modal opens
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      setLoadingUsers(true);
      setApiError(null);

      try {
        const res = await fetch("/api/chat/users", {
          method: "GET",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        const list: UserRow[] = Array.isArray(json)
          ? json
          : Array.isArray(json.users)
          ? json.users
          : Array.isArray(json.data)
          ? json.data
          : [];

        setUsers(list ?? []);
      } catch (err) {
        console.warn("[NewChatModal] /api/chat/users failed:", err);
        setApiError(
          err instanceof Error ? err.message : "Could not load /api/chat/users",
        );

        // fallback: just me
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: me } = await supabase
            .from("profiles")
            .select("id, full_name, role, email")
            .eq("id", user.id)
            .maybeSingle();
          setUsers(me ? [me as UserRow] : []);
        } else {
          setUsers([]);
        }

        toast.error("Showing limited user list.");
      } finally {
        setLoadingUsers(false);
        setSearch("");
      }

      // restore last convo
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(LOCAL_KEY)
          : null;

      if (forcedConversationId) {
        setActiveConvoId(forcedConversationId);
      } else if (stored) {
        setActiveConvoId(stored);
      } else {
        setActiveConvoId(null);
      }

      // load ids from view
      await loadMyConversations();
    })();
  }, [isOpen, supabase, forcedConversationId, loadMyConversations]);

  // auto role filter
  useEffect(() => {
    if (!isOpen) return;
    if (!context_type) return;
    if (!currentUserRole) return;

    if (context_type === "work_order") {
      if (currentUserRole === "tech") {
        setRole("advisor");
      } else if (currentUserRole === "advisor") {
        setRole("tech");
      } else {
        setRole("all");
      }
    }
  }, [isOpen, context_type, currentUserRole]);

  // load messages for active conversation
  useEffect(() => {
    if (!isOpen) return;
    if (!activeConvoId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setMessagesLoading(true);
      try {
        const res = await fetch("/api/chat/get-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConvoId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: MessageRow[] = await res.json();
        if (!cancelled) {
          setMessages(data);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_KEY, activeConvoId);
          }
        }
      } catch (e) {
        console.error("[NewChatModal] get-messages failed:", e);
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConvoId, isOpen]);

  // realtime
  useEffect(() => {
    if (!activeConvoId) return;
    const channel = supabase
      .channel(`modal-messages-${activeConvoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConvoId}`,
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          setMessages((prev) => [...prev, newMsg]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, activeConvoId]);

  // scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // filtered users
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return users.filter((u) => {
      if (role !== "all" && (u.role ?? "") !== role) return false;
      if (!t) return true;
      return (
        (u.full_name ?? "").toLowerCase().includes(t) ||
        (u.role ?? "").toLowerCase().includes(t) ||
        (u.email ?? "").toLowerCase().includes(t)
      );
    });
  }, [users, search, role]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // ensure conversation
  const ensureConversation = useCallback(
    async (participantIds: string[]): Promise<string | null> => {
      if (activeConvoId) return activeConvoId;

      let creatorId = created_by ?? currentUserId;
      if (!creatorId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        creatorId = user?.id ?? null;
      }
      if (!creatorId) {
        toast.error("No authenticated user.");
        return null;
      }

      const newId = uuidv4();
      const { error: convErr } = await supabase.from("conversations").insert({
        id: newId,
        created_by: creatorId,
        context_type,
        context_id,
      });
      if (convErr) {
        console.error("conversation insert failed:", convErr);
        toast.error("Could not create conversation");
        return null;
      }

      const setIds = new Set(participantIds);
      setIds.add(creatorId);

      const rows = Array.from(setIds).map((user_id) => ({
        id: uuidv4(),
        conversation_id: newId,
        user_id,
      }));

      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(rows);
      if (partErr) {
        console.error("participants insert failed:", partErr);
      }

      setActiveConvoId(newId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_KEY, newId);
      }
      onCreated?.(newId);

      // refresh ids
      void loadMyConversations();

      return newId;
    },
    [
      activeConvoId,
      created_by,
      currentUserId,
      supabase,
      context_type,
      context_id,
      onCreated,
      loadMyConversations,
    ],
  );

  // send
  const handleSend = useCallback(async () => {
    const text = sendText.trim();
    if (!text) return;
    if (sending) return;

    const targetIds = selectedIds.length ? selectedIds : [];

    const convoId = await ensureConversation(targetIds);
    if (!convoId || !currentUserId) return;

    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tempId,
      conversation_id: convoId,
      sender_id: currentUserId,
      content: text,
      sent_at: new Date().toISOString(),
      recipients: targetIds.filter((id) => id !== currentUserId),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSendText("");

    try {
      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convoId,
          senderId: currentUserId,
          content: text,
          recipients: optimistic.recipients ?? [],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error("send failed:", e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setSendText(text);
      toast.error("Message failed to send.");
    } finally {
      setSending(false);
    }
  }, [sendText, sending, selectedIds, ensureConversation, currentUserId]);

  // render
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Team chat"
      size="xl"
      onSubmit={undefined}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-neutral-400">
          Pick recipients → type → send. Conversation is created automatically.
        </div>
        <a
          href="/chat"
          className="text-xs text-orange-400 hover:text-orange-300"
        >
          Open conversation history →
        </a>
      </div>

      <div className="flex gap-3 min-h-[360px]">
        {/* LEFT */}
        <div className="w-60 shrink-0 flex flex-col gap-2">
          {apiError ? (
            <div className="rounded border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-100">
              {apiError}
            </div>
          ) : null}

          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, role, or email…"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-white focus:border-orange-400"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-[10px] text-neutral-500">
            {selectedIds.length} selected
          </div>

          <div className="flex-1 overflow-y-auto rounded border border-neutral-800 bg-neutral-900/40">
            {loadingUsers ? (
              <div className="p-3 text-xs text-neutral-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-neutral-400">
                No users match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-800 text-sm">
                {filtered.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <li key={u.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-white hover:bg-neutral-800/70">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-orange-500"
                          checked={checked}
                          onChange={() => toggle(u.id)}
                        />
                        <div className="min-w-0">
                          <div className="truncate">
                            {u.full_name ?? "(no name)"}
                          </div>
                          <div className="truncate text-[10px] text-neutral-400">
                            {u.role ?? "—"}
                            {u.email ? ` • ${u.email}` : ""}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex-1 flex flex-col rounded border border-neutral-800 bg-neutral-950">
          <div className="border-b border-neutral-800 px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-neutral-100">
                {activeConvoId
                  ? "Conversation"
                  : "New conversation (not saved until you send)"}
              </div>
              {myConversations.length > 0 ? (
                <select
                  value={activeConvoId ?? ""}
                  onChange={(e) => setActiveConvoId(e.target.value || null)}
                  className="text-[10px] bg-neutral-900 border border-neutral-700 rounded px-1 py-1 text-neutral-200"
                >
                  <option value="">Select conversation…</option>
                  {myConversations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {activeConvoId ? (
              <div className="text-[10px] text-neutral-500">
                ID: {activeConvoId.slice(0, 8)}
              </div>
            ) : null}
          </div>

          {/* messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messagesLoading ? (
              <div className="text-center text-neutral-500 text-xs py-6">
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-neutral-500 text-xs py-6">
                {activeConvoId
                  ? "No messages yet."
                  : "Pick recipients and send a message to start."}
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.sender_id === currentUserId;
                const time =
                  m.sent_at &&
                  new Date(m.sent_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                return (
                  <div
                    key={m.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-md px-3 py-2 text-xs break-words ${
                        isMine
                          ? "bg-orange-500 text-black"
                          : "bg-neutral-900 text-neutral-100"
                      }`}
                    >
                      <p>{m.content}</p>
                      {time ? (
                        <p
                          className={`mt-1 text-[9px] ${
                            isMine ? "text-black/60" : "text-neutral-400"
                          }`}
                        >
                          {time}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* composer */}
          <div className="border-t border-neutral-800 p-3 flex gap-2 items-end">
            <textarea
              value={sendText}
              onChange={(e) => setSendText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              className="flex-1 resize-none rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
            />
            <button
              onClick={() => void handleSend()}
              disabled={sending || !sendText.trim()}
              className="rounded border border-orange-500/70 text-orange-300 px-4 py-2 text-sm font-semibold hover:bg-orange-500/10 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}