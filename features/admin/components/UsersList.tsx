"use client";

import { useCallback, useEffect, useState } from "react";
import type { Database } from "@shared/types/types/supabase";

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

export default function UsersList(): JSX.Element {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<UserRole | "">("");

  // ✅ Load users from API route instead of Supabase client
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const res = await fetch(`/api/admin/users${q}`);
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      const data = await res.json();
      setRows(data.users ?? []);
    } catch (e) {
      setError((e as Error).message);
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
    const body = {
      full_name: editFullName.trim(),
      phone: editPhone.trim() || null,
      role: (editRole as UserRole) || null,
    };
    const res = await fetch(`/api/admin/users/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editId
            ? { ...r, full_name: body.full_name, phone: body.phone, role: body.role }
            : r,
        ),
      );
      setEditOpen(false);
    }
  }

  async function deleteUser(id: string): Promise<void> {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          className="input text-white placeholder:text-neutral-400"
          placeholder="Search name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-orange" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      {/* List */}
      <div className="rounded border border-neutral-800 bg-neutral-900">
        <div className="grid grid-cols-12 px-3 py-2 text-xs text-neutral-400">
          <div className="col-span-3">Name</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Phone</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <ul className="divide-y divide-neutral-800">
          {rows.map((u) => (
            <li key={u.id} className="grid grid-cols-12 items-center px-3 py-2">
              <div className="col-span-3 truncate">{u.full_name ?? "—"}</div>
              <div className="col-span-3 truncate">{u.email ?? "—"}</div>
              <div className="col-span-2 truncate">{u.phone ?? "—"}</div>
              <div className="col-span-2">{u.role ?? "—"}</div>
              <div className="col-span-2 flex justify-end gap-2">
                <button
                  className="btn btn-outline px-3 py-1 text-sm"
                  onClick={() => {
                    setEditId(u.id);
                    setEditFullName(u.full_name ?? "");
                    setEditPhone(u.phone ?? "");
                    setEditRole(u.role ?? "");
                    setEditOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn px-3 py-1 text-sm bg-red-600/90 hover:bg-red-600"
                  onClick={() => void deleteUser(u.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {rows.length === 0 && !loading && (
            <li className="px-3 py-6 text-sm text-neutral-400">
              No users found.
            </li>
          )}
          {loading && (
            <li className="px-3 py-6 text-sm text-neutral-400">Loading…</li>
          )}
          {error && (
            <li className="px-3 py-6 text-sm text-red-400">
              Error: {error}
            </li>
          )}
        </ul>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 p-4 shadow-card">
            <h3 className="mb-3 text-lg font-semibold">Edit User</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Full name</label>
                <input
                  className="input text-white"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Phone</label>
                <input
                  className="input text-white"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Role</label>
                <select
                  className="input text-white"
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
                <button className="btn btn-outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-orange" onClick={() => void saveEdit()}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}