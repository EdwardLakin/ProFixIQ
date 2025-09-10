// features/chat/components/RecipientPickerModal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import debounce from "lodash/debounce";

type DB = Database;
type Row = DB["public"]["Tables"]["profiles"]["Row"];

// Define a minimal profile shape and allow last_active_at to be missing in local types
type ProfileLite = Pick<Row, "id" | "full_name" | "role" | "email"> & {
  last_active_at?: string | null;
};

type UserRole = DB["public"]["Enums"]["user_role_enum"];
type RoleFilter = "all" | UserRole;

type Props = {
  open: boolean;
  onClose: () => void;
  onStartChat: (userIds: string[], groupName?: string) => Promise<void> | void;
  allowGroup?: boolean;
};

const ROLES: UserRole[] = ["owner", "admin", "manager", "advisor", "mechanic", "parts"];

export default function RecipientPickerModal({
  open,
  onClose,
  onStartChat,
  allowGroup = true,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [query, setQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [loading, setLoading] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [recent, setRecent] = useState<ProfileLite[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState<string>("");

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setGroupName("");
    setQuery("");
    setRoleFilter("all");
  }, [open]);

  // Recent (top 8)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, email, last_active_at")
        .order("last_active_at", { ascending: false })
        .limit(8);

      if (!cancelled) setRecent((error ? [] : (data ?? [])) as ProfileLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Debounced search
  const doSearch = useMemo(() => {
    const fn = debounce(async (q: string, role: RoleFilter) => {
      setLoading(true);
      try {
        let req = supabase
          .from("profiles")
          .select("id, full_name, role, email, last_active_at")
          .ilike("full_name", `%${q}%`)
          .limit(20);

        if (role !== "all") req = req.eq("role", role);

        const { data, error } = await req;
        setProfiles((error ? [] : (data ?? [])) as ProfileLite[]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return fn;
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    void doSearch(query.trim(), roleFilter);
    return () => doSearch.cancel();
  }, [open, query, roleFilter, doSearch]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canStart =
    selected.length > 0 && (!allowGroup || selected.length === 1 || groupName.trim().length > 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl rounded-md border border-neutral-800 bg-neutral-900 p-4 text-white shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Start a Conversation</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_180px]">
          <input
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          >
            <option value="all">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Recent */}
        {recent.length > 0 && query.trim().length === 0 && (
          <div className="mb-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-neutral-400">Recent</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {recent.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected([p.id])}
                  className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950 p-2 text-left hover:border-orange-500"
                >
                  <Avatar name={p.full_name ?? "User"} />
                  <div className="min-w-0">
                    <div className="truncate">{p.full_name ?? "User"}</div>
                    <div className="text-xs text-neutral-400">{p.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="max-h-72 overflow-auto rounded border border-neutral-800">
          {loading ? (
            <div className="p-3 text-neutral-400">Searching…</div>
          ) : profiles.length === 0 ? (
            <div className="p-3 text-neutral-400">No matches.</div>
          ) : (
            <ul className="divide-y divide-neutral-800">
              {profiles.map((p) => {
                const checked = selected.includes(p.id);
                return (
                  <li
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 bg-neutral-950 p-2 hover:bg-neutral-900"
                    onClick={() => toggle(p.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(p.id)}
                  >
                    <input type="checkbox" checked={checked} readOnly className="h-4 w-4" />
                    <Avatar name={p.full_name ?? "User"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{p.full_name ?? "User"}</div>
                      <div className="text-xs text-neutral-400">
                        {p.role} {p.email ? `• ${p.email}` : ""}
                      </div>
                    </div>
                    <OnlineDot online={!!p.last_active_at} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Group name */}
        {allowGroup && selected.length > 1 && (
          <div className="mt-3">
            <label className="mb-1 block text-sm text-neutral-300">Group name</label>
            <input
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2"
              placeholder="e.g., Saturday Crew"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-neutral-400">
            {selected.length} selected {allowGroup && selected.length > 1 ? "• group chat" : ""}
          </div>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => onStartChat(selected, groupName.trim() || undefined)}
            className="rounded bg-orange-600 px-4 py-2 font-semibold text-black disabled:opacity-60"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-700 text-xs">
      {initials || "U"}
    </div>
  );
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-neutral-600"}`}
      title={online ? "Online recently" : "Offline"}
    />
  );
}