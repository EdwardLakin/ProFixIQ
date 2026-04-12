"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import UserAvatar from "@/features/chat/components/UserAvatar";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];

type Participant = { id: string; full_name: string | null; avatar_url?: string | null; role?: string | null };
type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: Participant[];
  unread_count: number;
};

type Props = { open: boolean; onClose: () => void; seedConversationId?: string | null };

type ComposeContext = { context_type: string | null; context_id: string | null; deep_link: string | null; context_label: string };

function inferContext(pathname: string): ComposeContext {
  const match = (re: RegExp) => pathname.match(re)?.[1] ?? null;
  const workOrderId = match(/^\/work-orders\/([^/]+)/);
  if (workOrderId) return { context_type: "work_order", context_id: workOrderId, deep_link: `/work-orders/${workOrderId}`, context_label: `Work Order ${workOrderId.slice(0, 8)}` };
  const inspectionId = match(/^\/inspections\/([^/]+)/);
  if (inspectionId) return { context_type: "inspection", context_id: inspectionId, deep_link: `/inspections/${inspectionId}`, context_label: `Inspection ${inspectionId.slice(0, 8)}` };
  const bookingId = match(/^\/dashboard\/(?:advisor\/)?bookings\/([^/]+)/);
  if (bookingId) return { context_type: "booking", context_id: bookingId, deep_link: `/dashboard/bookings/${bookingId}`, context_label: `Booking ${bookingId.slice(0, 8)}` };
  const customerId = match(/^\/customers\/([^/]+)/);
  if (customerId) return { context_type: "customer", context_id: customerId, deep_link: `/customers/${customerId}`, context_label: `Customer ${customerId.slice(0, 8)}` };
  const vehicleId = match(/^\/vehicles\/([^/]+)/);
  if (vehicleId) return { context_type: "vehicle", context_id: vehicleId, deep_link: `/vehicles/${vehicleId}`, context_label: `Vehicle ${vehicleId.slice(0, 8)}` };
  return { context_type: null, context_id: null, deep_link: null, context_label: "General" };
}

function contextHref(conversation: ConversationRow): string | null {
  if (!conversation.context_type || !conversation.context_id) return null;
  const id = conversation.context_id;
  if (conversation.context_type === "work_order") return `/work-orders/${id}`;
  if (conversation.context_type === "inspection") return `/inspections/${id}`;
  if (conversation.context_type === "customer") return `/customers/${id}`;
  if (conversation.context_type === "vehicle") return `/vehicles/${id}`;
  if (conversation.context_type === "fleet") return `/fleet/units/${id}`;
  if (conversation.context_type === "booking") return `/dashboard/bookings`;
  return null;
}

export default function InboxModal({ open, onClose, seedConversationId = null }: Props): JSX.Element | null {
  const pathname = usePathname() ?? "/dashboard";
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<ConversationPayload[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [users, setUsers] = useState<Participant[]>([]);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [useContext, setUseContext] = useState(true);

  const context = useMemo(() => inferContext(pathname), [pathname]);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/chat/my-conversations", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as ConversationPayload[];
    setRows(data);
    setActiveConversationId((curr) => curr ?? seedConversationId ?? data[0]?.conversation.id ?? null);
  }, [seedConversationId]);

  useEffect(() => {
    if (!open) return;
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    void loadConversations();
    void fetch("/api/chat/users", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => setUsers((Array.isArray(json?.users) ? json.users : []).map((u: any) => ({ ...u, avatar_url: u.avatar_url ?? null }))));
  }, [open, supabase, loadConversations]);

  useEffect(() => {
    if (!open || !activeConversationId) return;
    void fetch("/api/chat/get-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConversationId }) })
      .then((r) => r.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
        void fetch("/api/chat/mark-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConversationId }) });
      });
  }, [open, activeConversationId]);

  useEffect(() => {
    if (!open || !activeConversationId) return;
    const ch = supabase.channel(`inbox-${activeConversationId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeConversationId}` }, (payload) => {
      const message = payload.new as MessageRow;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      void loadConversations();
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, activeConversationId, supabase, loadConversations]);

  const activeConversation = rows.find((x) => x.conversation.id === activeConversationId) ?? null;

  const visibleRows = rows.filter((row) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const participantNames = row.participants.map((p) => p.full_name ?? "").join(" ").toLowerCase();
    const preview = (row.latest_message?.content ?? "").toLowerCase();
    return participantNames.includes(term) || preview.includes(term);
  });

  const recipientOptions = users.filter((u) => {
    if (!me || u.id === me) return false;
    if (roleFilter !== "all" && (u.role ?? "") !== roleFilter) return false;
    return true;
  });

  const sendMessage = useCallback(async () => {
    const content = compose.trim();
    if (!content || sending || !me) return;
    setSending(true);
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const res = await fetch("/api/chat/start-conversation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participant_ids: selectedRecipients,
            context_type: useContext ? context.context_type : null,
            context_id: useContext ? context.context_id : null,
            title: useContext && context.context_label !== "General" ? context.context_label : null,
            is_broadcast: selectedRecipients.length > 3,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not start inbox thread");
        conversationId = data.id;
        setActiveConversationId(conversationId);
        await loadConversations();
      }
      const res = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, senderId: me, content, metadata: { deep_link: useContext ? context.deep_link : null, context_type: context.context_type, context_id: context.context_id } }),
      });
      if (res.ok) setCompose("");
    } finally {
      setSending(false);
    }
  }, [compose, sending, me, activeConversationId, selectedRecipients, useContext, context, loadConversations]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] bg-black/65 backdrop-blur-sm" onClick={onClose}>
      <div className="absolute right-0 top-0 h-full w-full max-w-[1200px] border-l border-[var(--metal-border-soft)] bg-[var(--theme-app-bg,#070b12)] p-3 md:p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-blackops text-sm uppercase tracking-[0.18em] text-[var(--accent-copper-soft)]">Inbox</h2>
          <button type="button" onClick={onClose} className="rounded border border-[var(--metal-border-soft)] px-2 py-1 text-xs text-neutral-200">Close</button>
        </div>

        <div className="grid h-[calc(100vh-90px)] grid-cols-1 gap-3 md:grid-cols-[320px_1fr] xl:grid-cols-[300px_1fr_280px]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-[var(--metal-border-soft)] bg-black/35">
            <div className="border-b border-[var(--metal-border-soft)] p-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inbox" className="w-full rounded border border-[var(--metal-border-soft)] bg-black/60 px-2 py-1.5 text-xs" />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {visibleRows.map((row) => {
                const mineExcluded = row.participants.filter((p) => p.id !== me);
                const primary = mineExcluded[0] ?? row.participants[0];
                const title =
                  row.conversation.title ??
                  (mineExcluded.map((p) => p.full_name).filter(Boolean).join(", ") ||
                    `Thread ${row.conversation.id.slice(0, 6)}`);
                return (
                  <button key={row.conversation.id} type="button" onClick={() => setActiveConversationId(row.conversation.id)} className={`flex w-full items-start gap-2 border-b border-[var(--metal-border-soft)]/50 px-2 py-2 text-left hover:bg-white/5 ${activeConversationId === row.conversation.id ? "bg-white/10" : ""}`}>
                    <UserAvatar name={primary?.full_name} avatarUrl={primary?.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-neutral-100">{title}</p>
                      <p className="truncate text-[11px] text-neutral-400">{row.latest_message?.content ?? "No messages"}</p>
                    </div>
                    {row.unread_count > 0 ? <span className="rounded-full bg-[var(--accent-copper-soft)] px-1.5 py-0.5 text-[10px] font-bold text-black">{row.unread_count}</span> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col rounded-xl border border-[var(--metal-border-soft)] bg-black/30">
            <div className="border-b border-[var(--metal-border-soft)] px-3 py-2 text-xs text-neutral-200">
              {activeConversation ? (activeConversation.conversation.title ?? "Thread") : "New message"}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              {messages.map((m) => {
                const mine = m.sender_id === me;
                const sender = users.find((u) => u.id === m.sender_id);
                return (
                  <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine ? <UserAvatar name={sender?.full_name} avatarUrl={sender?.avatar_url} size="sm" /> : null}
                    <div className={`max-w-[75%] rounded-lg border px-3 py-2 text-xs ${mine ? "border-orange-500/40 bg-orange-500/20 text-orange-50" : "border-[var(--metal-border-soft)] bg-black/50 text-neutral-100"}`}>
                      {m.content}
                    </div>
                  </div>
                );
              })}
            </div>
            {!activeConversationId ? (
              <div className="space-y-2 border-t border-[var(--metal-border-soft)] p-3 text-xs">
                <div className="flex gap-2">
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded border border-[var(--metal-border-soft)] bg-black/60 px-2 py-1">
                    <option value="all">All roles</option><option value="tech">Tech</option><option value="advisor">Advisor</option><option value="parts">Parts</option><option value="manager">Manager</option>
                  </select>
                  <button type="button" className="rounded border border-[var(--metal-border-soft)] px-2 py-1" onClick={() => setSelectedRecipients(recipientOptions.map((u) => u.id))}>Select all</button>
                </div>
                <div className="max-h-24 overflow-auto rounded border border-[var(--metal-border-soft)] p-2">
                  {recipientOptions.map((u) => (
                    <label key={u.id} className="mb-1 flex items-center gap-2">
                      <input type="checkbox" checked={selectedRecipients.includes(u.id)} onChange={(e) => setSelectedRecipients((prev) => e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id))} />
                      <UserAvatar name={u.full_name} avatarUrl={u.avatar_url} size="sm" />
                      <span>{u.full_name ?? u.id.slice(0, 6)}</span>
                    </label>
                  ))}
                </div>
                {context.context_type ? <label className="flex items-center gap-2"><input type="checkbox" checked={useContext} onChange={(e) => setUseContext(e.target.checked)} /> Attach {context.context_label}</label> : null}
              </div>
            ) : null}
            <div className="flex gap-2 border-t border-[var(--metal-border-soft)] p-3">
              <textarea value={compose} onChange={(e) => setCompose(e.target.value)} placeholder={activeConversationId ? "Reply…" : "Compose…"} className="h-16 flex-1 rounded border border-[var(--metal-border-soft)] bg-black/60 px-2 py-1.5 text-xs" />
              <button type="button" onClick={() => void sendMessage()} disabled={sending || (!activeConversationId && selectedRecipients.length === 0)} className="rounded bg-[var(--accent-copper-soft)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60">{sending ? "Sending" : "Send"}</button>
            </div>
          </section>

          <aside className="hidden rounded-xl border border-[var(--metal-border-soft)] bg-black/35 p-3 text-xs text-neutral-300 xl:block">
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-neutral-400">Context</h3>
            {activeConversation ? (
              <>
                <p className="mb-1 text-neutral-100">Type: {activeConversation.conversation.context_type ?? "general"}</p>
                <p className="mb-3 text-neutral-400">ID: {activeConversation.conversation.context_id ?? "—"}</p>
                {contextHref(activeConversation.conversation) ? (
                  <Link href={contextHref(activeConversation.conversation) ?? "#"} className="inline-flex rounded border border-[var(--accent-copper-soft)] px-2 py-1 text-[var(--accent-copper-soft)] hover:bg-orange-500/10">Open linked record</Link>
                ) : (
                  <p className="text-neutral-500">No direct deep-link route available yet.</p>
                )}
              </>
            ) : (
              <>
                <p className="mb-2">Compose mode uses your current page context when available.</p>
                <p className="text-neutral-400">Current: {context.context_label}</p>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
