"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import UserAvatar from "@/features/chat/components/UserAvatar";
import ModalShell from "@/features/shared/components/ModalShell";

type DB = Database;
type MessageRow = DB["public"]["Tables"]["messages"]["Row"];
type ConversationRow = DB["public"]["Tables"]["conversations"]["Row"];

type Participant = {
  id: string;
  kind?: "staff" | "customer";
  full_name: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type CustomerOption = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  can_message: boolean;
};

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: Participant[];
  unread_count: number;
  context: {
    type: string;
    label: string;
    secondary: string | null;
    href: string | null;
  } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  seedConversationId?: string | null;
};

type ComposeContext = {
  context_type: string | null;
  context_id: string | null;
  deep_link: string | null;
  context_label: string;
};

function inferContext(pathname: string): ComposeContext {
  const match = (re: RegExp) => pathname.match(re)?.[1] ?? null;

  const workOrderId = match(/^\/work-orders\/([^/]+)/);
  if (workOrderId) {
    return {
      context_type: "work_order",
      context_id: workOrderId,
      deep_link: `/work-orders/${workOrderId}`,
      context_label: `Work Order ${workOrderId.slice(0, 8)}`,
    };
  }

  const inspectionId = match(/^\/inspections\/([^/]+)/);
  if (inspectionId) {
    return {
      context_type: "inspection",
      context_id: inspectionId,
      deep_link: `/inspections/${inspectionId}`,
      context_label: `Inspection ${inspectionId.slice(0, 8)}`,
    };
  }

  const bookingId = match(/^\/dashboard\/(?:advisor\/)?bookings\/([^/]+)/);
  if (bookingId) {
    return {
      context_type: "booking",
      context_id: bookingId,
      deep_link: `/dashboard/bookings/${bookingId}`,
      context_label: `Booking ${bookingId.slice(0, 8)}`,
    };
  }

  const customerId = match(/^\/customers\/([^/]+)/);
  if (customerId) {
    return {
      context_type: "customer",
      context_id: customerId,
      deep_link: `/customers/${customerId}`,
      context_label: `Customer ${customerId.slice(0, 8)}`,
    };
  }

  const vehicleId = match(/^\/vehicles\/([^/]+)/);
  if (vehicleId) {
    return {
      context_type: "vehicle",
      context_id: vehicleId,
      deep_link: `/vehicles/${vehicleId}`,
      context_label: `Vehicle ${vehicleId.slice(0, 8)}`,
    };
  }

  return {
    context_type: null,
    context_id: null,
    deep_link: null,
    context_label: "General",
  };
}

export default function InboxModal({
  open,
  onClose,
  seedConversationId = null,
}: Props): JSX.Element | null {
  const pathname = usePathname() ?? "/dashboard";
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<ConversationPayload[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [users, setUsers] = useState<Participant[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [composeAudience, setComposeAudience] = useState<"internal" | "customer">("internal");
  const [roleFilter, setRoleFilter] = useState("all");
  const [useContext, setUseContext] = useState(true);

  const context = useMemo(() => inferContext(pathname), [pathname]);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/chat/my-conversations", { credentials: "include" });
    if (!res.ok) return;

    const data = (await res.json()) as ConversationPayload[];
    setRows(data);
    setActiveConversationId(
      (curr) => curr ?? seedConversationId ?? data[0]?.conversation.id ?? null,
    );
  }, [seedConversationId]);

  useEffect(() => {
    if (!open) return;

    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    void loadConversations();

    void fetch("/api/chat/users", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { users?: Participant[]; customers?: CustomerOption[] }) => {
        setUsers(
          (Array.isArray(json?.users) ? json.users : []).map((u) => ({
            ...u,
            avatar_url: u.avatar_url ?? null,
          })),
        );
        setCustomers(Array.isArray(json?.customers) ? json.customers : []);
      });
  }, [open, supabase, loadConversations]);

  useEffect(() => {
    if (!open || !activeConversationId) return;

    void fetch("/api/chat/get-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeConversationId }),
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages(Array.isArray(data) ? data : []);
        void fetch("/api/chat/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConversationId }),
        });
      });
  }, [open, activeConversationId]);

  useEffect(() => {
    if (!open || !activeConversationId) return;

    const ch = supabase
      .channel(`inbox-${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const message = payload.new as MessageRow;
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message],
          );
          void loadConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, activeConversationId, supabase, loadConversations]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const activeConversation =
    rows.find((x) => x.conversation.id === activeConversationId) ?? null;

  const visibleRows = rows.filter((row) => {
    if (row.conversation.channel !== composeAudience) return false;
    const term = search.toLowerCase().trim();
    if (!term) return true;

    const participantNames = row.participants
      .map((p) => p.full_name ?? "")
      .join(" ")
      .toLowerCase();

    const preview = (row.latest_message?.content ?? "").toLowerCase();

    return (
      participantNames.includes(term) ||
      preview.includes(term) ||
      (row.context?.label ?? "").toLowerCase().includes(term)
    );
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
            channel: composeAudience,
            customer_id: composeAudience === "customer" ? selectedCustomerId : null,
            context_type: useContext ? context.context_type : null,
            context_id: useContext ? context.context_id : null,
            title:
              useContext && context.context_label !== "General"
                ? context.context_label
                : null,
            is_broadcast: composeAudience === "internal" && selectedRecipients.length > 3,
            request_id: crypto.randomUUID(),
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
        body: JSON.stringify({
          conversationId,
          senderId: me,
          content,
          clientMessageId: crypto.randomUUID(),
          metadata: {
            deep_link: useContext ? context.deep_link : null,
            context_type: context.context_type,
            context_id: context.context_id,
          },
        }),
      });

      if (res.ok) setCompose("");
    } finally {
      setSending(false);
    }
  }, [
    compose,
    sending,
    me,
    activeConversationId,
    selectedRecipients,
    selectedCustomerId,
    composeAudience,
    useContext,
    context,
    loadConversations,
  ]);

  if (!open) return null;

  return (
    <ModalShell
      isOpen={open}
      onClose={onClose}
      title="Inbox"
      size="xl"
      hideFooter
      bodyScrollable={false}
    >
      <div className="mb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[color:var(--theme-text-muted)]">Shop communication center</p>
          <button
            type="button"
            className="rounded-full border border-[var(--accent-copper-soft)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-copper-soft)]"
            onClick={() => {
              setActiveConversationId(null);
              setSelectedRecipients([]);
              setSelectedCustomerId(null);
              setCompose("");
              setMessages([]);
            }}
          >
            New message
          </button>
        </div>
      </div>

      <div className="grid h-[min(72vh,760px)] grid-cols-1 gap-2.5 md:grid-cols-[290px_1fr] xl:grid-cols-[280px_1fr_230px]">
        <aside className="flex min-h-0 flex-col rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          <div className="space-y-2 border-b border-[color:var(--theme-border-soft)] p-2">
            <div className="grid grid-cols-2 rounded-lg bg-[color:var(--theme-surface-overlay)] p-0.5">
              {(["internal", "customer"] as const).map((audience) => (
                <button
                  key={audience}
                  type="button"
                  onClick={() => {
                    setComposeAudience(audience);
                    setActiveConversationId(null);
                    setMessages([]);
                  }}
                  className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    composeAudience === audience
                      ? "bg-[var(--accent-copper-soft)] text-[color:var(--theme-text-on-accent)]"
                      : "text-[color:var(--theme-text-secondary)]"
                  }`}
                >
                  {audience === "internal" ? "Team" : "Customers"}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search inbox"
              className="h-8 w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 text-xs"
            />
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
                <button
                  key={row.conversation.id}
                  type="button"
                  onClick={() => setActiveConversationId(row.conversation.id)}
                  className={`flex w-full items-start gap-2 border-b border-[color:var(--theme-border-soft)] px-2 py-1.5 text-left transition hover:bg-[color:var(--theme-surface-subtle)] ${
                    activeConversationId === row.conversation.id
                      ? "bg-[color:var(--theme-surface-subtle)] ring-1 ring-[var(--accent-copper-soft)]/35"
                      : ""
                  }`}
                >
                  <UserAvatar
                    name={primary?.full_name}
                    avatarUrl={primary?.avatar_url}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                      {title}
                    </p>
                    <p className="truncate text-[10px] text-[color:var(--theme-text-secondary)]">
                      {row.latest_message?.content ?? "No messages"}
                    </p>
                  </div>
                  {row.unread_count > 0 ? (
                    <span className="rounded-full bg-[var(--accent-copper-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--theme-text-on-accent)]">
                      {row.unread_count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
          <div className="border-b border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-medium text-[color:var(--theme-text-primary)]">
            {activeConversation
              ? activeConversation.conversation.title ?? "Thread"
              : "New message"}
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-auto p-2.5">
            {messages.map((m) => {
              const mine = m.sender_id === me;
              const sender =
                activeConversation?.participants.find(
                  (participant) => participant.id === m.sender_id,
                ) ?? users.find((u) => u.id === m.sender_id);

              return (
                <div
                  key={m.id}
                  className={`flex gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
                >
                  {!mine ? (
                    <UserAvatar
                      name={sender?.full_name}
                      avatarUrl={sender?.avatar_url}
                      size="sm"
                    />
                  ) : null}
                  <div
                    className={`max-w-[78%] rounded-lg border px-2.5 py-1.5 text-xs leading-relaxed ${
                      mine
                        ? "border-orange-500/35 bg-orange-500/18 text-orange-50"
                        : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
          </div>

          {!activeConversationId ? (
            <div className="space-y-2 border-t border-[color:var(--theme-border-soft)] p-2.5 text-xs">
              {composeAudience === "internal" ? <><div className="flex gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-8 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1"
                >
                  <option value="all">All roles</option>
                  <option value="tech">Tech</option>
                  <option value="advisor">Advisor</option>
                  <option value="parts">Parts</option>
                  <option value="manager">Manager</option>
                </select>
                <button
                  type="button"
                  className="h-8 rounded border border-[color:var(--theme-border-soft)] px-2"
                  onClick={() => setSelectedRecipients(recipientOptions.map((u) => u.id))}
                >
                  Select all
                </button>
              </div>

              <div className="max-h-20 overflow-auto rounded border border-[color:var(--theme-border-soft)] p-2">
                {recipientOptions.map((u) => (
                  <label key={u.id} className="mb-1 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.includes(u.id)}
                      onChange={(e) =>
                        setSelectedRecipients((prev) =>
                          e.target.checked
                            ? [...prev, u.id]
                            : prev.filter((id) => id !== u.id),
                        )
                      }
                    />
                    <UserAvatar
                      name={u.full_name}
                      avatarUrl={u.avatar_url}
                      size="sm"
                    />
                    <span>{u.full_name ?? u.id.slice(0, 6)}</span>
                  </label>
                ))}
              </div>
              </> : (
                <div className="max-h-32 overflow-auto rounded border border-[color:var(--theme-border-soft)] p-1.5">
                  {customers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      disabled={!customer.can_message}
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left ${
                        selectedCustomerId === customer.id
                          ? "bg-[color:var(--theme-surface-subtle)] ring-1 ring-[var(--accent-copper-soft)]"
                          : "hover:bg-[color:var(--theme-surface-subtle)]"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <span>
                        <span className="block font-medium text-[color:var(--theme-text-primary)]">{customer.full_name}</span>
                        <span className="block text-[10px] text-[color:var(--theme-text-muted)]">
                          {customer.can_message ? customer.email ?? customer.phone ?? "Portal customer" : "Portal activation required"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {context.context_type ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={useContext}
                    onChange={(e) => setUseContext(e.target.checked)}
                  />
                  Attach {context.context_label}
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-2 border-t border-[color:var(--theme-border-soft)] p-2.5">
            <textarea
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              placeholder={activeConversationId ? "Reply…" : "Compose…"}
              className="h-14 flex-1 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={
                sending ||
                (!activeConversationId &&
                  (composeAudience === "customer"
                    ? !selectedCustomerId
                    : selectedRecipients.length === 0))
              }
              className="h-14 rounded bg-[var(--accent-copper-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-on-accent)] disabled:opacity-60"
            >
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </section>

        <aside className="hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5 text-xs text-[color:var(--theme-text-secondary)] xl:block">
          <h3 className="mb-2 text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
            Context
          </h3>

          {activeConversation ? (
            <>
              <p className="mb-1 text-[color:var(--theme-text-primary)]">
              Type: {activeConversation.context?.type ?? "general"}
              </p>

              {activeConversation.context ? (
                <p className="mb-3 text-[color:var(--theme-text-secondary)]">
                  {activeConversation.context.label}
                  {activeConversation.context.secondary ? ` · ${activeConversation.context.secondary}` : ""}
                </p>
              ) : (
                <div className="mb-3 rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                  General thread with no linked record.
                </div>
              )}

              {activeConversation.context?.href ? (
                <Link
                  href={activeConversation.context.href}
                  className="inline-flex rounded border border-[var(--accent-copper-soft)] px-2 py-1 text-[11px] text-[var(--accent-copper-soft)] hover:bg-orange-500/10"
                >
                  Open linked record
                </Link>
              ) : (
                <p className="text-[11px] text-[color:var(--theme-text-muted)]">
                  No direct deep-link route available.
                </p>
              )}
            </>
          ) : (
            <div className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2 text-[11px] text-[color:var(--theme-text-secondary)]">
              <p className="mb-1 text-[color:var(--theme-text-primary)]">No thread selected.</p>
              <p>Compose mode uses current page context when available.</p>
            </div>
          )}
        </aside>
      </div>
    </ModalShell>
  );
}
