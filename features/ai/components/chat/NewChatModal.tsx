// features/ai/components/chat/NewChatModal.tsx (or wherever you keep it)
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

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

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  created_by: string;
  context_type?: string | null;
  context_id?: string | null;
};

export default function NewChatModal({
  isOpen,
  onClose,
  onCreated,
  created_by,
  context_type = null,
  context_id = null,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"all" | string>("all");
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      setLoadingUsers(true);
      setApiError(null);

      try {
        // IMPORTANT: send cookies
        const res = await fetch("/api/chat/users", {
          method: "GET",
          credentials: "include",
        });

        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          // e.g. { error: "Not authenticated" }
          throw new Error(json?.error || `HTTP ${res.status}`);
        }

        const list: UserRow[] = Array.isArray(json)
          ? json
          : Array.isArray(json.users)
          ? json.users
          : Array.isArray(json.data)
          ? json.data
          : [];

        setUsers(list ?? []);
      } catch (err) {
        // server route failed → fall back to RLS-limited client query
        console.warn("[NewChatModal] API users fallback:", err);
        setApiError(err instanceof Error ? err.message : "Could not load from /api/chat/users");

        // first, try to at least fetch *your* profile
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: me } = await supabase
            .from("profiles")
            .select("id, full_name, role, email")
            .eq("id", user.id)
            .maybeSingle();

          if (me) {
            setUsers([me as UserRow]);
          } else {
            // last resort: empty list
            setUsers([]);
          }
        } else {
          setUsers([]);
        }

        toast.error("Showing limited user list.");
      } finally {
        setLoadingUsers(false);
        setSelectedIds([]);
        setSearch("");
        setRole("all");
      }
    })();
  }, [isOpen, supabase]);

  const filtered = React.useMemo(() => {
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

  const handleCreate = async () => {
    if (selectedIds.length === 0) {
      toast.error("Pick at least one person");
      return;
    }
    setLoading(true);
    const convoId = uuidv4();
    try {
      const { error: convErr } = await supabase.from("conversations").insert({
        id: convoId,
        created_by,
        context_type,
        context_id,
      });
      if (convErr) throw convErr;

      const rows = selectedIds.map((user_id) => ({
        id: uuidv4(),
        conversation_id: convoId,
        user_id,
      }));

      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(rows);
      if (partErr) throw partErr;

      toast.success("Chat created");
      onCreated?.(convoId);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Could not create chat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Start a Conversation"
      size="md"
      onSubmit={handleCreate}
      submitText={loading ? "Creating…" : "Start"}
    >
      {/* show server error if API route rejected auth */}
      {apiError ? (
        <div className="mb-2 rounded border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-100">
          {apiError}
        </div>
      ) : null}

      <HeaderBar
        search={search}
        setSearch={setSearch}
        role={role}
        setRole={setRole}
      />

      <div className="mb-1 text-xs text-neutral-400">
        {selectedIds.length} selected
      </div>

      <UserList
        loading={loadingUsers}
        users={filtered}
        selectedIds={selectedIds}
        onToggle={toggle}
      />
    </ModalShell>
  );
}

function HeaderBar({
  search,
  setSearch,
  role,
  setRole,
}: {
  search: string;
  setSearch: (s: string) => void;
  role: string;
  setRole: (s: string) => void;
}) {
  return (
    <div className="mb-2 flex gap-2">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, role, or email…"
        className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-400 focus:outline-none"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-white focus:border-orange-400"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function UserList({
  loading,
  users,
  selectedIds,
  onToggle,
}: {
  loading: boolean;
  users: UserRow[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        Loading users…
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        No users match this filter.
      </div>
    );
  }

  return (
    <div className="max-h-56 overflow-y-auto rounded border border-neutral-800 bg-neutral-900/40">
      <ul className="divide-y divide-neutral-800">
        {users.map((u) => {
          const checked = selectedIds.includes(u.id);
          return (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-white hover:bg-neutral-800/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500"
                  checked={checked}
                  onChange={() => onToggle(u.id)}
                />
                <div className="min-w-0">
                  <div className="truncate">{u.full_name ?? "(no name)"}</div>
                  <div className="truncate text-xs text-neutral-400">
                    {u.role ?? "—"}
                    {u.email ? ` • ${u.email}` : ""}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}