"use client";

import { useCallback, useEffect, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import {
  AdminEmptyState,
  AdminPanel,
  AdminPanelTitle,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

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

    const body: { full_name: string; phone: string | null; role: UserRole | null } = {
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
        r.id === editId ? { ...r, full_name: body.full_name, phone: body.phone, role: body.role } : r,
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

  return (
    <div className="space-y-4">
      <AdminPanel>
        <AdminPanelTitle
          title="Filter"
          description="Query by name, email, or phone to quickly locate managed users."
          action={
            <Button type="button" variant="default" className="font-semibold" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Search"}
            </Button>
          }
        />

        <div className="p-4">
          <input
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-orange-400/70"
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Directory" description="Administrative user list with role and contact context." />

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Email</th>
                <th className="px-4 py-2.5 text-left">Phone</th>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((u) => (
                <tr key={u.id} className="text-neutral-200">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-neutral-100">{u.full_name ?? "—"}</div>
                    <div className="text-xs text-neutral-500">{u.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-2.5">{u.email ?? "—"}</td>
                  <td className="px-4 py-2.5">{u.phone ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-xs">{u.role ?? "—"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
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
                      <Button type="button" size="xs" variant="ghost" className="text-red-300" onClick={() => void deleteUser(u.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && rows.length === 0 ? (
            <AdminEmptyState title="No users found" body="Try expanding your search terms or add users from Owner onboarding tools." />
          ) : null}

          {loading ? <AdminEmptyState title="Loading users" body="Fetching the latest user directory." /> : null}
        </div>
      </AdminPanel>

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <AdminPanel className="w-full max-w-md p-4">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-neutral-400">User management</p>
            <h3 className="mt-1 text-lg font-semibold text-neutral-100">Edit User</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs uppercase tracking-[0.12em] text-neutral-400">
                Full name
                <input
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.12em] text-neutral-400">
                Phone
                <input
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.12em] text-neutral-400">
                Role
                <select
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm"
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
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="default" className="font-semibold" onClick={() => void saveEdit()}>
                  Save
                </Button>
              </div>
            </div>
          </AdminPanel>
        </div>
      ) : null}
    </div>
  );
}
