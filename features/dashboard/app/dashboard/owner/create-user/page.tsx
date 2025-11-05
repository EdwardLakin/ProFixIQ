"use client";

import { useState } from "react";
import UsersList from "@/features/admin/components/UsersList";
import type { Database } from "@shared/types/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

type CreatePayload = {
  username: string;
  password: string;
  full_name?: string | null;
  role?: UserRole | null;
  shop_id?: string | null;
  phone?: string | null;
};

export default function CreateUserPage(): JSX.Element {
  const [form, setForm] = useState<CreatePayload>({
    username: "",
    password: "",
    full_name: "",
    role: "mechanic",
    shop_id: null,
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // force UsersList to re-run its effect
  const [listRefreshKey, setListRefreshKey] = useState(0);

  // keep a tiny local list of the last few created users
  const [recentUsers, setRecentUsers] = useState<
    { username: string; full_name?: string | null; role?: string | null }[]
  >([]);

  // password reset small form
  const [resetUsername, setResetUsername] = useState("");
  const [resetPass, setResetPass] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body: CreatePayload = {
        username: form.username.trim().toLowerCase(),
        password: form.password.trim(),
        full_name: (form.full_name ?? "").trim() || null,
        role: form.role ?? null,
        shop_id: (form.shop_id ?? "")?.trim() || null,
        phone: (form.phone ?? "")?.trim() || null,
      };

      if (!body.username) {
        throw new Error("Username is required.");
      }
      if (!body.password) {
        throw new Error("Temporary password is required.");
      }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to create user.");
      }

      // local feedback
      setSuccess(`User "${body.username}" created.`);
      setRecentUsers((prev) => [
        { username: body.username, full_name: body.full_name, role: body.role ?? "mechanic" },
        ...prev,
      ].slice(0, 5)); // keep last 5

      // Clear sensitive fields
      setForm((f) => ({
        ...f,
        username: "",
        password: "",
        full_name: "",
        phone: "",
      }));

      // bump list
      setListRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(): Promise<void> {
    setResetBusy(true);
    setResetMsg(null);
    try {
      const uname = resetUsername.trim().toLowerCase();
      const tmp = resetPass.trim();
      if (!uname || !tmp) {
        throw new Error("Username and new temporary password are required.");
      }

      // expects a server route at /api/admin/reset-user-password
      // that finds the user by username and calls supabase.auth.admin.updateUser
      const res = await fetch("/api/admin/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uname, password: tmp }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to reset password.");
      }

      setResetMsg(`Password updated for ${uname}.`);
      setResetPass("");
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 text-white space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-header text-2xl">Create User</h1>
        <p className="text-sm text-neutral-400">
          Add shop staff with a username + temporary password.
        </p>
      </div>

      {/* main 2-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: create user */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold">New user</h2>
          <p className="text-sm text-neutral-400">
            The user will sign in with <span className="text-orange-300">their username</span> and this temporary password.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Full name</label>
              <input
                className="input text-white"
                placeholder="Full Name"
                value={form.full_name ?? ""}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Phone</label>
              <input
                className="input text-white"
                placeholder="Phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Username *</label>
              <input
                className="input text-white"
                placeholder="e.g. jsmith"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Temporary password *</label>
              <input
                className="input text-white"
                placeholder="Temporary Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Role</label>
              <select
                className="input text-white"
                value={form.role ?? ""}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as UserRole })
                }
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="mechanic">Mechanic</option>
                <option value="advisor">Advisor</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-400">Shop ID (optional)</label>
              <input
                className="input text-white"
                placeholder="Shop ID"
                value={form.shop_id ?? ""}
                onChange={(e) => setForm({ ...form, shop_id: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="btn btn-orange disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create User"}
            </button>
            {error && <div className="text-sm text-red-300">{error}</div>}
            {success && <div className="text-sm text-green-300">{success}</div>}
          </div>
        </div>

        {/* RIGHT: recents + internal reset */}
        <div className="space-y-6">
          {/* recent users */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-2">Recently created</h2>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-neutral-500">Create a user to see it here.</p>
            ) : (
              <ul className="space-y-2">
                {recentUsers.map((u) => (
                  <li
                    key={u.username}
                    className="flex items-center justify-between gap-2 rounded bg-neutral-800/40 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">{u.full_name || u.username}</div>
                      <div className="text-xs text-neutral-400">
                        @{u.username} • {u.role ?? "mechanic"}
                      </div>
                    </div>
                    <span className="rounded bg-neutral-700/40 px-2 py-0.5 text-xs text-neutral-200">
                      temp set
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* internal password reset */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-2">Reset password (internal)</h2>
            <p className="text-xs text-neutral-500 mb-3">
              For shop-created accounts (username-based). This won’t send email.
            </p>
            <div className="space-y-2">
              <input
                className="input text-white"
                placeholder="Username to reset"
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
              />
              <input
                className="input text-white"
                placeholder="New temporary password"
                type="password"
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void resetPassword()}
                disabled={resetBusy}
                className="btn btn-orange w-full disabled:opacity-50"
              >
                {resetBusy ? "Updating…" : "Reset Password"}
              </button>
              {resetMsg && (
                <div className="text-xs mt-1 text-neutral-200">{resetMsg}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live list below the form (force refresh with key) */}
      <div className="pt-2">
        <UsersList key={listRefreshKey} />
      </div>
    </div>
  );
}