"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type UserRole = DB["public"]["Enums"]["user_role_enum"];

const ROLES: UserRole[] = ["owner", "admin", "manager", "advisor", "mechanic"];

type RowLite = Pick<
  ProfileRow,
  "id" | "full_name" | "email" | "phone" | "role" | "created_at" | "shop_id"
>;

export default function UsersList(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [search, setSearch] = useState<string>("");
  const [rows, setRows] = useState<RowLite[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // edit dialog state
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editFullName, setEditFullName] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");
  const [editRole, setEditRole] = useState<UserRole | "">("");

  // -------- data load --------
  const load = useCallback(async () => {
    setLoading(true);
    const q = supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, created_at, shop_id")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data, error } =
      search.trim().length > 0
        ? await q.or(
            `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
          )
        : await q;

    if (!error && data) {
      setRows(data as RowLite[]);
    } else {
      setRows([]);
      // (optional) toast/error UI
      // console.error(error);
    }
    setLoading(false);
  }, [supabase, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // -------- edit flow (no more casting to ProfileRow) --------
  function openEdit(u: {
    id: string;
    full_name: string | null;
    phone: string | null;
    role: UserRole | null;
  }): void {
    setEditId(u.id);
    setEditFullName(u.full_name ?? "");
    setEditPhone(u.phone ?? "");
    setEditRole(u.role ?? "");
    setEditOpen(true);
  }

  async function saveEdit(): Promise<void> {
    if (!editId) return;
    const payload: {
      full_name: string;
      phone: string | null;
      role: UserRole | null;
    } = {
      full_name: editFullName.trim(),
      phone: editPhone.trim() || null,
      role: (editRole as UserRole) || null,
    };

    const res = await fetch(`/api/admin/users/${encodeURIComponent(editId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // optimistic refresh
      setRows((prev) =>
        prev.map((r) =>
          r.id === editId
            ? {
                ...r,
                full_name: payload.full_name,
                phone: payload.phone,
                role: payload.role,
              }
            : r,
        ),
      );
      setEditOpen(false);
    } else {
      const msg = await res.text().catch(() => "");
      alert(msg || "Update failed");
    }
  }

  async function deleteUser(id: string): Promise<void> {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    } else {
      const msg = await res.text().catch(() => "");
      alert(msg || "Delete failed");
    }
  }

  // -------- render --------
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
        <button
          className="btn btn-orange"
          onClick={() => void load()}
          disabled={loading}
        >
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
                  onClick={() =>
                    openEdit({
                      id: u.id,
                      full_name: u.full_name,
                      phone: u.phone,
                      role: u.role as UserRole | null,
                    })
                  }
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
        </ul>
      </div>

      {/* Edit dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded border border-neutral-700 bg-neutral-900 p-4 shadow-card">
            <h3 className="mb-3 text-lg font-semibold">Edit User</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Full name
                </label>
                <input
                  className="input text-white"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Phone
                </label>
                <input
                  className="input text-white"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Role
                </label>
                <select
                  className="input text-white"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole | "")}
                >
                  <option value="">—</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="btn btn-outline"
                  onClick={() => setEditOpen(false)}
                >
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