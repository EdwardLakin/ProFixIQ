//features/admin/components/UsersList.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type UserRole = DB["public"]["Enums"]["user_role_enum"];

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole | null;
  created_at: string | null;
  shop_id: string | null;
};

const T = {
  border: "border-[color:var(--metal-border-soft,#1f2937)]",
  borderStrong: "border-[color:var(--metal-border,#111827)]",
  glass:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] bg-black/35 backdrop-blur-md",
  glassStrong:
    "bg-[radial-gradient(900px_520px_at_18%_0%,rgba(197,106,47,0.12),transparent_55%),linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.42))] backdrop-blur-md",
  shadow: "shadow-[0_18px_40px_rgba(0,0,0,0.85)]",
  panel: "rounded-2xl border",
  label: "block text-[0.7rem] uppercase tracking-[0.12em] text-neutral-400",
  input:
    "w-full rounded-md border bg-black/50 px-3 py-2 text-sm text-neutral-100 outline-none transition " +
    "placeholder:text-neutral-500 focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  chip:
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] " +
    "border-[color:var(--metal-border-soft,#1f2937)] bg-black/35 text-neutral-200",
};

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function UsersList(): JSX.Element {
  const [search, setSearch] = useState<string>("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editFullName, setEditFullName] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editRole, setEditRole] = useState<UserRole | "">("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/admin/users${q}`);
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);

      const json: { users?: UserRow[] } = await res.json();
      setRows(json.users ?? []);
    } catch (e) {
      setError(safeMsg(e, "Failed to load users"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveEdit(): Promise<void> {
    if (!editId) return;

    const body: { full_name: string; phone: string | null; role: UserRole | null } =
      {
        full_name: editFullName.trim(),
        phone: editPhone.trim() || null,
        role: (editRole as UserRole) || null,
      };

    const res = await fetch(`/api/admin/users/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError(`Failed to save (${res.status})`);
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.id === editId
          ? { ...r, full_name: body.full_name, phone: body.phone, role: body.role }
          : r,
      ),
    );
    setEditOpen(false);
  }

  async function deleteUser(id: string): Promise<void> {
    const ok = window.confirm("Delete this user?");
    if (!ok) return;

    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Failed to delete (${res.status})`);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const card = useMemo(
    () => [T.panel, T.border, T.glass, T.shadow, "p-4"].join(" "),
    [],
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className={T.label}>Search</label>
            <input
              className={[T.input, T.border].join(" ")}
              placeholder="Search name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button
            type="button"
            variant="default"
            className="font-semibold"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Search"}
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className={[T.panel, T.border, T.glassStrong, T.shadow].join(" ")}>
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Phone</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <ul className="divide-y divide-[color:var(--metal-border-soft,#1f2937)]">
          {rows.map((u) => (
            <li key={u.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm text-neutral-200">
              <div className="col-span-3 truncate">
                <div className="font-semibold text-neutral-100">{u.full_name ?? "—"}</div>
                <div className="mt-1 text-xs text-neutral-500 font-mono">{u.id.slice(0, 8)}</div>
              </div>

              <div className="col-span-3 truncate text-neutral-300">{u.email ?? "—"}</div>
              <div className="col-span-2 truncate text-neutral-300">{u.phone ?? "—"}</div>

              <div className="col-span-2">
                <span className={T.chip}>{u.role ?? "—"}</span>
              </div>

              <div className="col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="text-[0.7rem]"
                  onClick={() => {
                    setEditId(u.id);
                    setEditFullName(u.full_name ?? "");
                    setEditPhone(u.phone ?? "");
                    setEditRole(u.role ?? "");
                    setEditOpen(true);
                  }}
                >
                  Edit
                </Button>

                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-[0.7rem] text-red-300 hover:bg-red-900/20"
                  onClick={() => void deleteUser(u.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}

          {!loading && rows.length === 0 && (
            <li className="px-4 py-8 text-sm text-neutral-400">No users found.</li>
          )}

          {loading && (
            <li className="px-4 py-8 text-sm text-neutral-400">Loading…</li>
          )}
        </ul>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div
            className={[
              "w-full max-w-md",
              T.panel,
              T.border,
              T.glassStrong,
              T.shadow,
              "p-4",
            ].join(" ")}
          >
            <div className="text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">
              User management
            </div>
            <h3 className="mt-1 text-lg font-semibold text-neutral-100">Edit User</h3>

            <div className="mt-4 space-y-3">
              <div>
                <label className={T.label}>Full name</label>
                <input
                  className={[T.input, T.border].join(" ")}
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>

              <div>
                <label className={T.label}>Phone</label>
                <input
                  className={[T.input, T.border].join(" ")}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div>
                <label className={T.label}>Role</label>
                <select
                  className={[T.input, T.border].join(" ")}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole | "")}
                >
                  <option value="">—</option>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="advisor">Advisor</option>
                  <option value="mechanic">Mechanic</option>
                </select>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="default" className="font-semibold" onClick={() => void saveEdit()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}