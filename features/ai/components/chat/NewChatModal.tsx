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
  created_by?: string; // optional, but we don’t rely on it
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
        const res = await fetch("/api/chat/users", {
          method: "GET",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok) {
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
        console.warn("[NewChatModal] /api/chat/users failed:", err);
        setApiError(
          err instanceof Error ? err.message : "Could not load /api/chat/users",
        );

        // fallback: show self
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

  const getCreatorId = async (): Promise<string | null> => {
    if (created_by && created_by.length > 20) return created_by;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  };

  const handleCreate = async () => {
    if (selectedIds.length === 0) {
      toast.error("Pick at least one person");
      return;
    }

    setLoading(true);
    const convoId = uuidv4();

    try {
      const creatorId = await getCreatorId();
      if (!creatorId) {
        toast.error("No authenticated user – please sign in again.");
        setLoading(false);
        return;
      }

      // conversations: created_by must equal auth.uid()
      const { error: convErr } = await supabase.from("conversations").insert({
        id: convoId,
        created_by: creatorId,
        context_type,
        context_id,
      });
      if (convErr) throw convErr;

      // participants: include selected + creator
      const allIds = new Set(selectedIds);
      allIds.add(creatorId);

      const rows = Array.from(allIds).map((user_id) => ({
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
    } catch (e: any) {
      console.error("[NewChatModal] create error:", e);
      toast.error(e?.message ?? "Could not create chat");
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

function HeaderBar({ search, setSearch, role, setRole }: any) {
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