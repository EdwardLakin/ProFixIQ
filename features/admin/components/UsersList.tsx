"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
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

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "advisor", label: "Advisor" },
  { value: "mechanic", label: "Mechanic" },
];

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export default function UsersList(): JSX.Element {
  const [search, setSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
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

  const filteredRows = useMemo(
    () => rows.filter((row) => (roleFilter === "all" ? true : row.role === roleFilter)),
    [roleFilter, rows],
  );

  const summary = useMemo(() => {
    const privileged = rows.filter((row) => row.role === "owner" || row.role === "admin").length;
    const missingPhone = rows.filter((row) => !row.phone).length;
    const unassignedRole = rows.filter((row) => !row.role).length;
    return {
      total: rows.length,
      privileged,
      missingPhone,
      unassignedRole,
    };
  }, [rows]);

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
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? `Failed to save (${res.status})`);
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
          title="Workflow Purpose"
          description="Users covers account governance. Use Employees for workforce posture and activity review."
          action={
            <Link href="/dashboard/workforce/people" className="text-xs font-medium text-[color:var(--theme-accent-text)]">
              Open Employees →
            </Link>
          }
        />
        <AdminStatGrid>
          <AdminStatCard label="Users in scope" value={summary.total} />
          <AdminStatCard label="Privileged users" value={summary.privileged} hint="Owner/Admin roles" />
          <AdminStatCard label="Missing phone" value={summary.missingPhone} hint="Potential contact gaps" />
          <AdminStatCard label="Missing role assignment" value={summary.unassignedRole} hint="Needs governance follow-up" />
          <AdminStatCard label="Visible rows" value={filteredRows.length} hint="After role filters" />
        </AdminStatGrid>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="Filter & Locate"
          description="Search by name, email, or phone, then narrow by role for targeted governance actions."
          action={
            <Button type="button" variant="default" className="font-semibold" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          }
        />

        <AdminToolbar>
          <AdminField label="Search" className="flex-1">
            <input
              className="w-full rounded-lg border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-soft)]"
              placeholder="Search name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </AdminField>
          <AdminField label="Role" className="w-full md:w-52">
            <select
              className="w-full rounded-lg border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-[var(--accent-copper-soft)]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | "all")}
            >
              <option value="all">All roles</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </AdminField>
        </AdminToolbar>
        {error ? <p className="px-4 pb-3 text-xs text-red-300">{error}</p> : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle
          title="User Directory"
          description="Edit or remove account records. Review role and identity context before changes."
          action={
            <div className="flex items-center gap-3 text-xs">
              <Link href="/dashboard/workforce/people" className="font-medium text-[color:var(--theme-accent-text)]">
                Workforce posture →
              </Link>
              <Link href="/dashboard/workforce/payroll-review" className="font-medium text-[color:var(--theme-accent-text)]">
                Payroll review →
              </Link>
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Email</th>
                <th className="px-4 py-2.5 text-left">Phone</th>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-left">Created</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
              {filteredRows.map((u) => (
                <tr key={u.id} className="text-[color:var(--theme-text-primary)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[color:var(--theme-text-primary)]">{u.full_name ?? "—"}</div>
                    <div className="text-xs text-[color:var(--theme-text-muted)]">{u.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-2.5">{u.email ?? "—"}</td>
                  <td className="px-4 py-2.5">{u.phone ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <AdminBadge>{u.role ?? "—"}</AdminBadge>
                  </td>
                  <td className="px-4 py-2.5 text-[color:var(--theme-text-secondary)]">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
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
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-red-300"
                        onClick={() => void deleteUser(u.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && filteredRows.length === 0 ? (
            <AdminEmptyState
              title="No users found"
              body="Try adjusting search and role filters, or confirm users exist in the current shop scope."
            />
          ) : null}

          {loading ? <AdminEmptyState title="Loading users" body="Fetching the latest user directory." /> : null}
        </div>
      </AdminPanel>

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--theme-surface-overlay)] px-4">
          <AdminPanel className="w-full max-w-md p-4">
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">User management</p>
            <h3 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">Edit User</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                Full name
                <input
                  className="mt-1 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                Phone
                <input
                  className="mt-1 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                Role
                <select
                  className="mt-1 w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole | "")}
                >
                  <option value="">—</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
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
