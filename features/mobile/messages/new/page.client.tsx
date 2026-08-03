"use client";

import {
  Check,
  ChevronLeft,
  MessageCircle,
  Search,
  Send,
  UserPlus,
  X,
} from "lucide-react";
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

function initials(name: string | null): string {
  const value = String(name ?? "User").trim();
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
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

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.includes(user.id)),
    [selectedIds, users],
  );

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
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <Link
            href="/mobile/messages"
            aria-label="Return to messages"
            className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-white"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="mobile-dashboard-hero__eyebrow">Team communication</div>
            <h1 className="mobile-dashboard-hero__title">New conversation</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Select the right people, add the first message and keep work moving.
            </p>
          </div>
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <MessageCircle aria-hidden className="h-5 w-5" />
          </span>
        </div>
      </section>

      {apiError ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {apiError}
        </div>
      ) : null}

      <section className="mobile-command-panel overflow-hidden border">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[color:var(--theme-text-primary)]">
                Recipients
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : "Choose at least one person."}
              </p>
            </div>
            <UserPlus className="h-5 w-5 text-[color:var(--accent-copper)]" />
          </div>

          {selectedUsers.length > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {selectedUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleSelected(user.id)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-200"
                >
                  {user.full_name ?? "No name"}
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 border-b border-[color:var(--theme-border-soft)] p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="Filter recipients by role"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="relative block">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, role or email"
              className="pl-10"
            />
          </label>
        </div>

        <div className="max-h-[22rem] overflow-y-auto">
          {loadingUsers ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl bg-[color:var(--theme-surface-subtle)]"
                />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-6 text-center text-sm text-[color:var(--theme-text-secondary)]">
              No users match this filter.
            </div>
          ) : (
            filteredUsers.map((user) => {
              const checked = selectedIds.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleSelected(user.id)}
                  className={`flex min-h-[4.5rem] w-full items-center gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-2.5 text-left last:border-b-0 ${
                    checked
                      ? "bg-blue-500/8"
                      : "active:bg-[color:var(--theme-surface-hover)]"
                  }`}
                >
                  <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[color:var(--theme-surface-subtle)] text-xs font-extrabold text-[color:var(--accent-copper)]">
                    {initials(user.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[color:var(--theme-text-primary)]">
                      {user.full_name ?? "No name"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs capitalize text-[color:var(--theme-text-secondary)]">
                      {user.role ?? "Role not set"}
                      {user.email ? ` · ${user.email}` : ""}
                    </span>
                  </span>
                  <span
                    className={`inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                      checked
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-[color:var(--theme-border-strong)] text-transparent"
                    }`}
                  >
                    <Check aria-hidden className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="mobile-command-panel border p-4">
        <label className="block">
          <span className="text-sm font-bold text-[color:var(--theme-text-primary)]">
            First message
          </span>
          <span className="mt-0.5 block text-xs text-[color:var(--theme-text-secondary)]">
            This message starts the conversation.
          </span>
          <textarea
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type your message…"
            className="mt-3 resize-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !message.trim() || selectedIds.length === 0}
          className="mobile-command-primary mt-3 inline-flex w-full items-center justify-center gap-2 px-4 text-sm font-bold disabled:opacity-45"
        >
          <Send aria-hidden className="h-4 w-4" />
          {sending ? "Sending…" : "Start conversation"}
        </button>
      </section>
    </main>
  );
}
