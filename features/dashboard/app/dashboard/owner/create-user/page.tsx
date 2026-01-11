//features/dashboard/app/dashboard/owner/create-user/page.tsx

"use client";

import { useEffect, useState } from "react";
import PageShell from "@/features/shared/components/PageShell";
import UsersList from "@/features/admin/components/UsersList";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
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

const COPPER = "#C57A4A";

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

  // tiny local list of the last few created users
  const [recentUsers, setRecentUsers] = useState<
    { username: string; full_name?: string | null; role?: string | null }[]
  >([]);

  // password reset mini-form
  const [resetUsername, setResetUsername] = useState("");
  const [resetPass, setResetPass] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // creator’s shop id (for auto-fill)
  const [creatorShopId, setCreatorShopId] = useState<string | null>(null);

  // load current user's shop_id once
  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      const shopId = profile?.shop_id ?? null;
      setCreatorShopId(shopId);

      if (shopId) {
        setForm((prev) => ({
          ...prev,
          shop_id: shopId,
        }));
      }
    };

    void load();
  }, []);

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
        shop_id: (form.shop_id ?? "")?.trim() || creatorShopId || null,
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
      setRecentUsers((prev) =>
        [
          {
            username: body.username,
            full_name: body.full_name,
            role: body.role ?? "mechanic",
          },
          ...prev,
        ].slice(0, 5),
      );

      // clear sensitive fields
      setForm((f) => ({
        ...f,
        username: "",
        password: "",
        full_name: "",
        phone: "",
        shop_id: body.shop_id ?? creatorShopId ?? null,
      }));

      // refresh list below
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
    <PageShell
      title="Create User"
      description="Add shop and fleet staff with a username and temporary password."
    >
      {/* top 2-column content */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: create user */}
        <div className="space-y-4 rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_28px_80px_rgba(0,0,0,0.85)] sm:p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">New team member</h2>
            <p className="text-sm text-neutral-400">
              Create a username-based account for{" "}
              <span style={{ color: COPPER }}>
                shop staff, drivers, dispatchers, and fleet managers
              </span>
              . They&apos;ll sign in with their username and the temporary
              password you set here.
            </p>
            <p className="text-[11px] text-neutral-500">
              If they forget it later, an owner or manager can issue a new
              temporary password from this screen.
            </p>
          </div>

          {(error || success) && (
            <div className="space-y-2">
              {error && (
                <div className="rounded-md border border-red-500/60 bg-red-950/60 px-3 py-2 text-xs text-red-100 shadow-[0_0_18px_rgba(127,29,29,0.45)]">
                  {error}
                </div>
              )}
              {success && (
                <div className="rounded-md border border-emerald-500/60 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-100 shadow-[0_0_18px_rgba(6,95,70,0.45)]">
                  {success}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Full name
              </label>
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="Full name"
                value={form.full_name ?? ""}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Phone
              </label>
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="Phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="e.g. jsmith"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
              />
              <p className="text-[11px] text-neutral-500">
                Use lowercase letters / numbers only. This becomes their login.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Temporary password <span className="text-red-400">*</span>
              </label>
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="Temporary password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <p className="text-[11px] text-neutral-500">
                Share this directly with the user. They can change it later from
                the Settings screen if you enable that flow.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Role
              </label>
              <select
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                value={form.role ?? ""}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as UserRole })
                }
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="advisor">Advisor</option>
                <option value="mechanic">Mechanic</option>
                <option value="parts">Parts</option>
                <option value="driver">Driver</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="fleet_manager">Fleet manager</option>
              </select>
              <p className="text-[11px] text-neutral-500">
                Use{" "}
                <span style={{ color: COPPER }}>
                  driver / dispatcher / fleet manager
                </span>{" "}
                for Fleet Portal accounts.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Shop ID{" "}
                <span className="text-neutral-500">
                  {creatorShopId ? "(auto from your profile)" : "(optional)"}
                </span>
              </label>
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="Shop ID"
                value={form.shop_id ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shop_id: e.target.value || null,
                  })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create user"}
            </button>
            <p className="text-xs text-neutral-500">
              Share the username and temporary password with the team member
              when you&apos;re ready for them to sign in.
            </p>
          </div>
        </div>

        {/* RIGHT: recents + internal reset */}
        <div className="space-y-6">
          {/* recently created */}
          <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.75)] sm:p-6">
            <h2 className="mb-2 text-lg font-semibold text-white">
              Recently created
            </h2>
            {recentUsers.length === 0 ? (
              <p className="text-sm text-neutral-500">
                New users you create will appear here with their role.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentUsers.map((u) => (
                  <li
                    key={u.username}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/60 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {u.full_name || u.username}
                      </div>
                      <div className="text-xs text-neutral-400">
                        @{u.username} • {u.role ?? "mechanic"}
                      </div>
                    </div>
                    <span className="rounded-full border border-white/16 bg-black/60 px-2 py-0.5 text-[11px] text-neutral-200">
                      temp set
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* reset */}
          <div className="rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.75)] sm:p-6">
            <h2 className="mb-2 text-lg font-semibold text-white">
              Reset password (internal)
            </h2>
            <p className="mb-3 text-xs text-neutral-500">
              For username-based shop and fleet accounts only. This does not
              email the user; you&apos;ll need to share the new temporary
              password with them.
            </p>
            <div className="space-y-2 text-sm">
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="Username to reset"
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-white/12 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--accent-copper-soft)]"
                placeholder="New temporary password"
                type="password"
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
              />
              <button
                type="button"
                onClick={() => void resetPassword()}
                disabled={resetBusy}
                className="mt-1 inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetBusy ? "Updating…" : "Reset password"}
              </button>
              {resetMsg && (
                <div className="mt-1 text-xs text-neutral-200">{resetMsg}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* USERS LIST (full width, own card) */}
      <div className="mt-6 rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md shadow-[0_24px_70px_rgba(0,0,0,0.85)] sm:p-6">
        <h2 className="mb-3 text-lg font-semibold text-white">All users</h2>
        <p className="mb-3 text-xs text-neutral-500">
          This is the full list of users for your shop. New accounts appear here
          automatically.
        </p>
        <UsersList key={listRefreshKey} />
      </div>
    </PageShell>
  );
}