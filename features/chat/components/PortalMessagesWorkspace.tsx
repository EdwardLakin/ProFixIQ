"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import ChatWindow from "@/features/ai/components/chat/ChatWindow";
import UserAvatar from "@/features/chat/components/UserAvatar";
import {
  createMessageDraft,
  getOfflineMessageDraft,
  removeOfflineMessageDraft,
  resolveMessagingDraftScope,
  saveOfflineMessageDraft,
  warmMessagingRouteShells,
  type OfflineMessageDraft,
} from "@/features/chat/offline/messageDrafts";
import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";

type ConversationRow = Database["public"]["Tables"]["conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type ConversationPayload = {
  conversation: ConversationRow;
  latest_message: MessageRow | null;
  participants: Array<{
    id: string;
    kind: "staff" | "customer";
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  }>;
  unread_count: number;
  context: {
    type: string;
    label: string;
    secondary: string | null;
    href: string | null;
  } | null;
};

type ContextOption = {
  type: "work_order" | "booking" | "vehicle";
  id: string;
  label: string;
  secondary: string | null;
};

export default function PortalMessagesWorkspace(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const searchParams = useSearchParams();
  const requestedWorkOrderId = searchParams.get("workOrderId")?.trim() ?? "";
  const requestedContextKey = requestedWorkOrderId
    ? `work_order:${requestedWorkOrderId}`
    : "";
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ConversationPayload[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newThread, setNewThread] = useState(
    searchParams.get("compose") === "1",
  );
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [contextKey, setContextKey] = useState("");
  const [contextOptions, setContextOptions] = useState<ContextOption[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftScope, setDraftScope] = useState<OfflineMutationScope | null>(
    null,
  );
  const [newThreadDraft, setNewThreadDraft] =
    useState<OfflineMessageDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const draftTargetId = "portal:new-conversation";

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/chat/my-conversations", {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Could not load messages");
    const payload = (await response.json()) as ConversationPayload[];
    setRows(payload);
    setActiveId((current) => current ?? payload[0]?.conversation.id ?? null);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
    void fetch("/api/chat/context-options", { credentials: "include" })
      .then((response) => response.json())
      .then((contextPayload) => {
        const options = (contextPayload as { options?: ContextOption[] })
          .options;
        const safeOptions = Array.isArray(options) ? options : [];
        setContextOptions(safeOptions);
        if (
          requestedContextKey &&
          safeOptions.some(
            (option) => `${option.type}:${option.id}` === requestedContextKey,
          )
        ) {
          setContextKey((current) => current || requestedContextKey);
        }
      })
      .catch(() => undefined);
    void loadConversations()
      .catch((cause: unknown) => {
        if (navigator.onLine) {
          setError(
            cause instanceof Error ? cause.message : "Could not load messages",
          );
        }
      })
      .finally(() => setLoading(false));
  }, [loadConversations, requestedContextKey, supabase]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void resolveMessagingDraftScope(userId).then(async (scope) => {
      if (!scope || cancelled) return;
      const stored = await getOfflineMessageDraft({
        scope,
        targetId: draftTargetId,
      });
      if (cancelled) return;
      const next =
        stored ?? createMessageDraft({ scope, targetId: draftTargetId });
      setDraftScope(scope);
      setNewThreadDraft(next);
      setMessage(next.content);
      setSubject(next.subject ?? "");
      setContextKey(next.contextKey || requestedContextKey);
      setDraftSaved(Boolean(stored?.content || stored?.subject));
      setDraftReady(true);
      if (navigator.onLine) void warmMessagingRouteShells();
    });
    return () => {
      cancelled = true;
    };
  }, [requestedContextKey, userId]);

  useEffect(() => {
    if (!draftReady || !draftScope || !newThreadDraft || !newThread) return;
    const timer = window.setTimeout(() => {
      if (!message.trim() && !subject.trim() && !contextKey) {
        void removeOfflineMessageDraft({
          scope: draftScope,
          targetId: draftTargetId,
        });
        setDraftSaved(false);
        return;
      }
      void saveOfflineMessageDraft({
        ...newThreadDraft,
        content: message,
        subject,
        contextKey,
        updatedAt: new Date().toISOString(),
      }).then(() => setDraftSaved(true));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    contextKey,
    draftReady,
    draftScope,
    message,
    newThread,
    newThreadDraft,
    subject,
  ]);

  const active = rows.find((row) => row.conversation.id === activeId) ?? null;

  const startConversation = async () => {
    const content = message.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);

    if (!navigator.onLine) {
      setError(
        "Offline — this message is saved as a draft and has not been sent.",
      );
      setSending(false);
      return;
    }

    const selectedContext = contextOptions.find(
      (option) => `${option.type}:${option.id}` === contextKey,
    );
    const requestId =
      newThreadDraft?.conversationRequestId ?? crypto.randomUUID();

    try {
      const createResponse = await fetch("/api/chat/start-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          channel: "customer",
          participant_ids: [],
          context_type: selectedContext?.type ?? null,
          context_id: selectedContext?.id ?? null,
          title:
            subject.trim() || selectedContext?.label || "Message from customer",
        }),
      });
      const created = (await createResponse.json()) as {
        id?: string;
        error?: string;
      };
      if (!createResponse.ok || !created.id) {
        throw new Error(created.error ?? "Could not start conversation");
      }

      const messageResponse = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: created.id,
          content,
          clientMessageId:
            newThreadDraft?.clientMessageId ?? crypto.randomUUID(),
        }),
      });
      if (!messageResponse.ok) {
        const failure = (await messageResponse.json()) as { error?: string };
        throw new Error(failure.error ?? "Could not send message");
      }

      setMessage("");
      setSubject("");
      setContextKey("");
      setNewThread(false);
      setActiveId(created.id);
      if (draftScope) {
        await removeOfflineMessageDraft({
          scope: draftScope,
          targetId: draftTargetId,
        });
        setNewThreadDraft(
          createMessageDraft({ scope: draftScope, targetId: draftTargetId }),
        );
      }
      setDraftSaved(false);
      await loadConversations();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send message",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Communication center
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
            Messages
          </h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Contact the advisor connected to your service, with shop-team
            coverage when they are unavailable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewThread(true);
            setActiveId(null);
          }}
          className="desktop-btn-primary rounded-full border px-4 py-2 text-sm font-semibold"
        >
          Message your advisor
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[68dvh] overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-medium)] md:min-h-[620px] md:grid-cols-[280px_1fr]">
        <aside
          className={`${newThread || activeId ? "hidden md:block" : "block"} border-b border-[color:var(--theme-border-soft)] md:border-b-0 md:border-r`}
        >
          <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
            Conversations
          </div>
          <div className="max-h-72 overflow-auto md:max-h-[570px]">
            {loading ? (
              <p className="p-4 text-sm text-[color:var(--theme-text-secondary)]">
                Loading…
              </p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-[color:var(--theme-text-secondary)]">
                No conversations yet. Message the shop when you have a question.
              </p>
            ) : (
              rows.map((row) => {
                const staff = row.participants.find(
                  (participant) => participant.kind === "staff",
                );
                return (
                  <button
                    key={row.conversation.id}
                    type="button"
                    onClick={() => {
                      setNewThread(false);
                      setActiveId(row.conversation.id);
                    }}
                    className={`flex w-full gap-3 border-b border-[color:var(--theme-border-soft)] px-3 py-3 text-left transition hover:bg-[color:var(--theme-surface-subtle)] ${
                      activeId === row.conversation.id
                        ? "bg-[color:var(--theme-surface-subtle)]"
                        : ""
                    }`}
                  >
                    <UserAvatar
                      name={staff?.full_name ?? "Shop team"}
                      avatarUrl={staff?.avatar_url}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {row.conversation.title ??
                            row.context?.label ??
                            "Shop team"}
                        </span>
                        {row.unread_count > 0 ? (
                          <span className="rounded-full bg-[var(--accent-copper-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--theme-text-on-accent)]">
                            {row.unread_count}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[color:var(--theme-text-secondary)]">
                        {row.latest_message?.content ?? "No messages yet"}
                      </span>
                      {row.context ? (
                        <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.1em] text-[var(--accent-copper-soft)]">
                          {row.context.label}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          className={`${!newThread && !activeId ? "hidden md:flex" : "flex"} min-h-[68dvh] flex-col md:min-h-[520px]`}
        >
          {newThread ? (
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:justify-center sm:p-8">
              <button
                type="button"
                onClick={() => setNewThread(false)}
                className="mb-1 inline-flex min-h-10 w-fit items-center rounded-full border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold md:hidden"
              >
                ← Conversations
              </button>
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                  New message
                </h2>
                <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  {requestedWorkOrderId
                    ? "Your work order advisor receives this first. Shop management can cover if they are unavailable."
                    : "Choose a service item so the message reaches the right shop team."}
                </p>
              </div>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject (optional)"
                maxLength={160}
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              />
              <select
                value={contextKey}
                onChange={(event) => setContextKey(event.target.value)}
                className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm"
              >
                <option value="">General question</option>
                {contextOptions.map((option) => (
                  <option
                    key={`${option.type}:${option.id}`}
                    value={`${option.type}:${option.id}`}
                  >
                    {option.label}
                    {option.secondary ? ` — ${option.secondary}` : ""}
                  </option>
                ))}
              </select>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="How can the shop help?"
                rows={6}
                maxLength={10_000}
                className="resize-none rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-3 text-sm"
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setNewThread(false)}
                  className="desktop-btn-secondary min-h-11 rounded-full border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void startConversation()}
                  disabled={sending || !message.trim()}
                  className="desktop-btn-primary min-h-11 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send message"}
                </button>
              </div>
              {draftSaved ? (
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  Saved on this device · delivery requires a connection
                </p>
              ) : null}
            </div>
          ) : active && userId ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3">
                <div>
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="mb-2 inline-flex min-h-9 items-center rounded-full border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold md:hidden"
                  >
                    ← Conversations
                  </button>
                  <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {active.conversation.title ?? "Shop team"}
                  </h2>
                  <p className="text-xs text-[color:var(--theme-text-secondary)]">
                    {active.participants
                      .filter((participant) => participant.kind === "staff")
                      .map((participant) => participant.full_name)
                      .filter(Boolean)
                      .join(", ") || "Service team"}
                  </p>
                </div>
                {active.context ? (
                  active.context.href ? (
                    <Link
                      href={active.context.href}
                      className="rounded-full border border-[var(--accent-copper-soft)] px-3 py-1.5 text-xs text-[var(--accent-copper-soft)]"
                    >
                      {active.context.label} →
                    </Link>
                  ) : (
                    <span className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs text-[color:var(--theme-text-secondary)]">
                      {active.context.label}
                    </span>
                  )
                ) : null}
              </div>
              <div className="min-h-0 flex-1 p-2">
                <ChatWindow
                  conversationId={active.conversation.id}
                  userId={userId}
                  title={active.conversation.title ?? "Shop team"}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
              Select a conversation or message the shop.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
