"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "mechanic", label: "Technician" },
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

type UsersResponse =
  | UserRow[]
  | { users?: UserRow[]; data?: UserRow[]; error?: string };

function normalizeUsers(input: UsersResponse | null): UserRow[] {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.users)) return input.users;
  if (Array.isArray(input?.data)) return input.data;
  return [];
}

export default function MobileNewMessagePage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (active) setCurrentUserId(user?.id ?? null);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoadingUsers(true);
      setApiError(null);
      try {
        const response = await fetch("/api/chat/users", {
          credentials: "include",
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | UsersResponse
          | null;
        if (response.ok) {
          if (active) setUsers(normalizeUsers(body));
          return;
        }
        if (response.status !== 401) {
          throw new Error(
            !Array.isArray(body) && body?.error
              ? body.error
              : `Could not load users (${response.status}).`,
          );
        }

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, role, email")
          .order("full_name", { ascending: true })
          .limit(200);
        if (error) throw error;
        if (active) {
          setUsers(
            (profiles ?? []).map((profile) => ({
              id: profile.user_id ?? profile.id,
              full_name: profile.full_name,
              role: profile.role,
              email: profile.email,
            })),
          );
        }
      } catch (caught) {
        if (!active) return;
        setUsers([]);
        setApiError(
          caught instanceof Error ? caught.message : "Could not load users.",
        );
      } finally {
        if (active) setLoadingUsers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (role !== "all" && (user.role ?? "") !== role) return false;
      if (!term) return true;
      return [user.full_name, user.role, user.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [role, search, users]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  };

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || sending) return;
    if (!currentUserId) {
      toast.error("No authenticated user.");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("Select at least one recipient.");
      return;
    }

    setSending(true);
    try {
      const conversationResponse = await fetch(
        "/api/chat/start-conversation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participant_ids: selectedIds }),
        },
      );
      const conversationBody = (await conversationResponse
        .json()
        .catch(() => null)) as { id?: string; error?: string } | null;
      if (!conversationResponse.ok || !conversationBody?.id) {
        throw new Error(
          conversationBody?.error || "Could not start conversation.",
        );
      }

      const messageResponse = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationBody.id,
          senderId: currentUserId,
          content: text,
        }),
      });
      if (!messageResponse.ok) {
        const body = (await messageResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Message failed to send.");
      }

      router.replace(`/mobile/messages/${conversationBody.id}`);
    } catch (caught) {
      toast.error(
        caught instanceof Error
          ? caught.message
          : "Could not start conversation.",
      );
      setSending(false);
    }
  }, [currentUserId, message, router, selectedIds, sending]);

  return (
    <div className="min-h-screen bg-background px-4 py-4 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/mobile/messages"
            className="rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[0.7rem] text-[color:var(--theme-text-secondary)]"
          >
            ← Messages
          </Link>
          <h1 className="font-blackops text-lg uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]">
            New chat
          </h1>
          <div className="w-[78px]" aria-hidden="true" />
        </div>

        {apiError ? (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {apiError}
          </div>
        ) : null}

        <section className="metal-card space-y-3 rounded-xl border border-[var(--metal-border-soft)] bg-[var(--metal-surface)] px-3 py-3">
          <div className="space-y-1">
            <div className="text-[0.7rem] font-medium text-[color:var(--theme-text-secondary)]">
              Recipients
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIds.length === 0 ? (
                <span className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
                  No recipients selected.
                </span>
              ) : (
                users
                  .filter((user) => selectedIds.includes(user.id))
                  .map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-[0.7rem] text-[color:var(--theme-text-primary)]"
                    >
                      {user.full_name ?? "No name"}
                      <button
                        type="button"
                        onClick={() => toggleSelected(user.id)}
                        aria-label={`Remove ${user.full_name ?? "recipient"}`}
                        className="ml-1 text-[0.75rem] text-[color:var(--theme-text-muted)] hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-10 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 text-[0.75rem] text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)]"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, role, or email"
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 text-[0.75rem] text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)]">
            {loadingUsers ? (
              <div className="px-3 py-3 text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                Loading users…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-3 py-3 text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                No users match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--theme-border-soft)]">
                {filteredUsers.map((user) => {
                  const checked = selectedIds.includes(user.id);
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => toggleSelected(user.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[0.75rem] ${
                          checked
                            ? "bg-[var(--accent-copper-soft)]/10"
                            : "hover:bg-[color:var(--theme-surface-overlay)]"
                        }`}
                      >
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border text-[0.6rem] ${
                            checked
                              ? "border-[var(--accent-copper-soft)] bg-[var(--accent-copper-soft)] text-[color:var(--theme-text-on-accent)]"
                              : "border-[var(--metal-border-soft)] text-[color:var(--theme-text-muted)]"
                          }`}
                        >
                          {checked ? "✓" : ""}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[color:var(--theme-text-primary)]">
                            {user.full_name ?? "No name"}
                          </div>
                          <div className="truncate text-[0.65rem] text-[color:var(--theme-text-secondary)]">
                            {user.role ?? "—"}
                            {user.email ? ` • ${user.email}` : ""}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="metal-card space-y-3 rounded-xl border border-[var(--metal-border-soft)] bg-[var(--metal-surface)] px-3 py-3">
          <div className="text-[0.7rem] font-medium text-[color:var(--theme-text-secondary)]">
            First message
          </div>
          <textarea
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type your message…"
            className="w-full resize-none rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)]"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !message.trim() || selectedIds.length === 0}
            className="min-h-11 w-full rounded-xl bg-[color:var(--accent-copper)] px-4 text-sm font-semibold text-white disabled:opacity-45"
          >
            {sending ? "Sending…" : "Start conversation"}
          </button>
        </section>
      </div>
    </div>
  );
}
