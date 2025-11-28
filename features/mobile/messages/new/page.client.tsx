// app/mobile/messages/new/page.client.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { startConversation } from "@ai/lib/chat/startConversation";



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

export default function MobileNewMessagePage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Load current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    })();
  }, [supabase]);

  // Load users (same pattern as desktop modal)
  useEffect(() => {
    (async () => {
      setLoadingUsers(true);
      setApiError(null);

      let gotUsers = false;
      try {
        const res = await fetch("/api/chat/users", {
          method: "GET",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({} as any));

        if (res.ok) {
          const list: UserRow[] = Array.isArray(json)
            ? json
            : Array.isArray(json.users)
            ? json.users
            : Array.isArray(json.data)
            ? json.data
            : [];
          setUsers(list ?? []);
          gotUsers = true;
        } else if (res.status !== 401) {
          setApiError(json?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn("[MobileNewMessage] /api/chat/users failed:", err);
      }

      if (!gotUsers) {
        try {
          const { data: profiles, error } = await supabase
            .from("profiles")
            .select("id, user_id, full_name, role, email")
            .order("full_name", { ascending: true })
            .limit(200);

          if (error) {
            setApiError("Could not load users.");
            setUsers([]);
          } else {
            setUsers(
              (profiles ?? []).map((p) => ({
                id: p.user_id ?? p.id,
                full_name: p.full_name,
                role: p.role,
                email: p.email,
              })),
            );
          }
        } catch {
          setApiError("Could not load users.");
          setUsers([]);
        }
      }

      setLoadingUsers(false);
    })();
  }, [supabase]);

  // Filtered users
  const filteredUsers = useMemo(() => {
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    if (sending) return;

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
      // 1) Create conversation via shared helper
      const res = await startConversation({
        created_by: currentUserId,
        participant_ids: selectedIds,
      });

      const conversationId = res.id;

      // 2) Insert first message via existing API route
      const msgRes = await fetch("/api/chat/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          senderId: currentUserId,
          content: text,
        }),
      });

      if (!msgRes.ok) {
        console.error(
          "[MobileNewMessage] send-message failed:",
          await msgRes.text(),
        );
        toast.error("Message failed to send.");
        setSending(false);
        return;
      }

      // 3) Jump into the live conversation thread
      router.replace(`/mobile/messages/${conversationId}`);
    } catch (e) {
      console.error("[MobileNewMessage] startConversation failed:", e);
      toast.error("Could not start conversation.");
      setSending(false);
    }
  }, [message, sending, currentUserId, selectedIds, router]);

  return (
    <div className="min-h-screen bg-background px-4 py-4 text-foreground">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-full border border-[var(--metal-border-soft)] bg-black/60 px-3 py-1 text-[0.7rem] text-neutral-300 hover:bg-black/80"
          >
            ← Back
          </button>
          <h1 className="font-blackops text-lg uppercase tracking-[0.16em] text-neutral-200">
            New chat
          </h1>
          <div className="w-[60px]" />{/* spacer */}
        </div>

        {apiError && (
          <div className="rounded-md border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
            {apiError}
          </div>
        )}

        {/* Recipient + role selectors */}
        <div className="metal-card rounded-xl border border-[var(--metal-border-soft)] bg-[var(--metal-surface)] px-3 py-3 space-y-3">
          {/* Selected pills */}
          <div className="space-y-1">
            <div className="text-[0.7rem] font-medium text-neutral-400">
              Recipients
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIds.length === 0 ? (
                <span className="text-[0.7rem] text-neutral-500">
                  No recipients selected.
                </span>
              ) : (
                users
                  .filter((u) => selectedIds.includes(u.id))
                  .map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[0.7rem] text-neutral-100 border border-[var(--metal-border-soft)]"
                    >
                      {u.full_name ?? "(no name)"}
                      <button
                        type="button"
                        onClick={() => toggleSelected(u.id)}
                        className="ml-1 text-[0.75rem] text-neutral-500 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))
              )}
            </div>
          </div>

          {/* Role filter + search */}
          <div className="flex gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 rounded border border-[var(--metal-border-soft)] bg-black/70 px-2 text-[0.75rem] text-neutral-100 focus:border-[var(--accent-copper-soft)] focus:outline-none"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, role, email…"
              className="flex-1 h-9 rounded border border-[var(--metal-border-soft)] bg-black/70 px-2 text-[0.75rem] text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)] focus:outline-none"
            />
          </div>

          {/* User list */}
          <div className="mt-2 max-h-64 overflow-y-auto rounded border border-[var(--metal-border-soft)] bg-black/60">
            {loadingUsers ? (
              <div className="px-3 py-3 text-[0.75rem] text-neutral-400">
                Loading users…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-3 py-3 text-[0.75rem] text-neutral-400">
                No users match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-800">
                {filteredUsers.map((u) => {
                  const checked = selectedIds.includes(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => toggleSelected(u.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[0.75rem] ${
                          checked
                            ? "bg-[var(--accent-copper-soft)]/10"
                            : "hover:bg-black/60"
                        }`}
                      >
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border text-[0.6rem] ${
                            checked
                              ? "border-[var(--accent-copper-soft)] bg-[var(--accent-copper-soft)] text-black"
                              : "border-[var(--metal-border-soft)] text-neutral-500"
                          }`}
                        >
                          {checked ? "✓" : ""}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-neutral-100">
                            {u.full_name ?? "(no name)"}
                          </div>
                          <div className="truncate text-[0.65rem] text-neutral-400">
                            {u.role ?? "—"}
                            {u.email ? ` • ${u.email}` : ""}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* First message composer */}
        <div className="metal-card rounded-xl border border-[var(--metal-border-soft)] bg-[var(--metal-surface)] px-3 py-3 space-y-3">
          <div className="text-[0.7rem] font-medium text-neutral-400">
            First message
          </div>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message…"
            className="w-full resize-none rounded border border-[var(--metal-border-soft)] bg-black/70 px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 focus:border-[var(--accent-copper-soft)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              sending || !message.trim() || selectedIds.length === 0
            }
            className="
              w-full rounded-full border border-[var(--accent-copper-soft)]
              bg-black/80 px-4 py-2 text-sm font-semibold
              text-[var(--accent-copper-soft)]
              shadow-[0_10px_24px_rgba(0,0,0,0.85)]
              hover:bg-black/95 disabled:opacity-50
            "
          >
            {sending ? "Starting…" : "Start chat"}
          </button>
        </div>
      </div>
    </div>
  );
}