"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";
import InviteCandidatesList from "@/features/admin/components/InviteCandidatesList";
import UsersList from "@/features/admin/components/UsersList";
import {
  buildShopUsernameNamespace,
  buildUsernameSuggestions,
  normalizeProvisioningUsername,
} from "@/features/users/lib/username";
import { OwnerSettingsPanel } from "./OwnerSettingsPanels";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

type CreatePayload = {
  username: string;
  password: string;
  email?: string | null;
  full_name?: string | null;
  role?: UserRole | null;
  phone?: string | null;
};

type CreatedUser = {
  username: string;
  full_name?: string | null;
  role?: string | null;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-[color:var(--theme-input-border,var(--theme-border-soft))] bg-[color:var(--theme-input-bg,var(--theme-surface-page))] px-3 py-2 text-sm text-[color:var(--theme-input-text,var(--theme-text-primary))] placeholder:text-[color:var(--theme-text-muted)] outline-none focus:border-[var(--accent-copper)]";

export default function OwnerSettingsUsersSection({
  creatorShopName,
  creatorRole,
  onUserCreated,
}: {
  creatorShopName: string | null;
  creatorRole: string | null;
  onUserCreated?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<CreatePayload>({
    username: "",
    password: "",
    email: "",
    full_name: "",
    role: "mechanic",
    phone: "",
  });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdPersonHref, setCreatedPersonHref] = useState<string | null>(null);
  const [openPeopleAfterCreate, setOpenPeopleAfterCreate] = useState(true);
  const [recentUsers, setRecentUsers] = useState<CreatedUser[]>([]);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [resetUsername, setResetUsername] = useState("");
  const [resetPass, setResetPass] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  useEffect(() => {
    if (usernameTouched) return;

    const [firstSuggestion] = buildUsernameSuggestions({
      shopName: creatorShopName,
      fullName: form.full_name,
    });
    if (!firstSuggestion) return;

    setForm((prev) => {
      if ((prev.username ?? "").trim().length > 0) return prev;
      return { ...prev, username: firstSuggestion };
    });
  }, [creatorShopName, form.full_name, usernameTouched]);

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setCreatedUserId(null);
    setCreatedPersonHref(null);

    try {
      const body: CreatePayload = {
        username: normalizeProvisioningUsername(
          form.username.trim(),
          buildShopUsernameNamespace(creatorShopName),
        ),
        password: form.password,
        email: (form.email ?? "").trim().toLowerCase() || null,
        full_name: (form.full_name ?? "").trim() || null,
        role: form.role ?? null,
        phone: (form.phone ?? "").trim() || null,
      };

      if (!body.username) throw new Error("Username is required.");
      if (!body.full_name) throw new Error("Full name is required.");
      if (body.password.trim().length < 8) {
        throw new Error("Temporary password must be at least 8 characters.");
      }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = (await res.json().catch(() => null)) as
        | {
            error?: string;
            user_id?: string;
            username?: string;
            email?: string | null;
            people_record_href?: string;
          }
        | null;

      if (!res.ok) throw new Error(payload?.error || "Failed to create user.");

      const createdUsername = payload?.username ?? body.username;
      const createdEmail = payload?.email ?? null;

      setSuccess(
        `User "${createdUsername}" created. They can sign in with username "${createdUsername}" and the temporary password entered here.${
          createdEmail ? ` Contact email saved: ${createdEmail}.` : ""
        }`,
      );
      setCreatedUserId(payload?.user_id ?? null);
      setCreatedPersonHref(payload?.people_record_href ?? null);
      setRecentUsers((prev) =>
        [
          {
            username: createdUsername,
            full_name: body.full_name,
            role: body.role ?? "mechanic",
          },
          ...prev,
        ].slice(0, 5),
      );
      setForm((prev) => ({
        ...prev,
        username: "",
        password: "",
        email: "",
        full_name: "",
        phone: "",
      }));
      setUsernameTouched(false);
      setListRefreshKey((key) => key + 1);
      onUserCreated?.();

      if (openPeopleAfterCreate && payload?.people_record_href) {
        router.push(payload.people_record_href);
      }
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
      const username = resetUsername.trim().toLowerCase();
      if (!username || !resetPass) {
        throw new Error("Username and new temporary password are required.");
      }

      const res = await fetch("/api/admin/reset-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: resetPass }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed to reset password (${res.status}).`);
      }

      setResetMsg(`Password updated for ${username}.`);
      setResetPass("");
    } catch (e) {
      setResetMsg(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <OwnerSettingsPanel
        id="team-access-create-user"
        title="Create User"
        description="Provision a staff login, assign the initial app role, and seed the People/workforce profile for this shop."
      >
        {(error || success) ? (
          <div className="space-y-2">
            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                {success}
                {createdPersonHref ? (
                  <button
                    type="button"
                    onClick={() => router.push(createdPersonHref)}
                    className="ml-2 font-semibold underline underline-offset-2"
                  >
                    Open People record
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Full name
            </span>
            <input
              className={INPUT_CLASS}
              value={form.full_name ?? ""}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              placeholder="Full name"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Phone
            </span>
            <input
              className={INPUT_CLASS}
              value={form.phone ?? ""}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="Phone"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Contact email
            </span>
            <input
              className={INPUT_CLASS}
              type="email"
              value={form.email ?? ""}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="technician@example.com"
            />
            <span className="block text-[11px] text-[color:var(--theme-text-muted)]">
              Saved on `profiles.email`; username remains the staff sign-in identity.
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Username
            </span>
            <input
              className={INPUT_CLASS}
              value={form.username}
              onChange={(event) => {
                setUsernameTouched(true);
                setForm({ ...form, username: event.target.value });
              }}
              placeholder="e.g. profixlucas"
            />
            <span className="block text-[11px] text-[color:var(--theme-text-muted)]">
              Normalized and shop-prefixed before creating Supabase Auth plus `profiles`.
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Temporary password
            </span>
            <input
              className={INPUT_CLASS}
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="At least 8 characters"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
              Role
            </span>
            <select
              className={INPUT_CLASS}
              value={form.role ?? ""}
              onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
            >
              {creatorRole === "owner" ? <option value="owner">Owner</option> : null}
              {creatorRole === "owner" ? <option value="admin">Admin</option> : null}
              <option value="manager">Manager</option>
              <option value="foreman">Foreman</option>
              <option value="lead_hand">Lead Hand</option>
              <option value="advisor">Advisor</option>
              <option value="service">Service</option>
              <option value="parts">Parts</option>
              <option value="mechanic">Mechanic / Technician</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="driver">Driver</option>
              <option value="fleet_manager">Fleet manager</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
            <input
              type="checkbox"
              checked={openPeopleAfterCreate}
              onChange={(event) => setOpenPeopleAfterCreate(event.target.checked)}
            />
            Open People record immediately after create
          </label>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Creating..." : "Create user"}
          </Button>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            Shop access is assigned server-side from the current owner/admin profile.
          </p>
        </div>
      </OwnerSettingsPanel>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1fr]">
        <OwnerSettingsPanel
          id="team-access-recent"
          title="Recently Created"
          description="Last accounts created from this settings session."
        >
          {recentUsers.length === 0 ? (
            <p className="text-sm text-[color:var(--theme-text-muted)]">
              New users you create here will appear immediately in this list and the user directory.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentUsers.map((user) => (
                <li
                  key={user.username}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm"
                >
                  <span>
                    <span className="block font-semibold text-[color:var(--theme-text-primary)]">
                      {user.full_name || user.username}
                    </span>
                    <span className="text-xs text-[color:var(--theme-text-muted)]">
                      @{user.username} • {user.role ?? "mechanic"}
                    </span>
                  </span>
                  <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                    temp set
                  </span>
                </li>
              ))}
            </ul>
          )}
          {createdUserId ? (
            <button
              type="button"
              className="text-xs font-semibold text-[var(--accent-copper)]"
              onClick={() => router.push(`/dashboard/admin/people/${createdUserId}?from=owner-settings`)}
            >
              Open latest People record
            </button>
          ) : null}
        </OwnerSettingsPanel>

        <OwnerSettingsPanel
          id="team-access-reset-password"
          title="Reset Password"
          description="Issue a new temporary password for username-based staff accounts."
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={INPUT_CLASS}
              value={resetUsername}
              onChange={(event) => setResetUsername(event.target.value)}
              placeholder="Username"
            />
            <input
              className={INPUT_CLASS}
              type="password"
              value={resetPass}
              onChange={(event) => setResetPass(event.target.value)}
              placeholder="New temporary password"
            />
            <Button type="button" onClick={() => void resetPassword()} disabled={resetBusy}>
              {resetBusy ? "Updating..." : "Reset"}
            </Button>
          </div>
          {resetMsg ? (
            <p className="text-xs text-[color:var(--theme-text-secondary)]">{resetMsg}</p>
          ) : null}
        </OwnerSettingsPanel>
      </div>

      <OwnerSettingsPanel
        id="team-access-pending-invites"
        title="Pending Invites"
        description="Create accounts from staged staff invite candidates or resend their invite email."
      >
        <InviteCandidatesList />
      </OwnerSettingsPanel>

      <OwnerSettingsPanel
        id="team-access-users"
        title="All Users"
        description="Shop-scoped account directory backed by `profiles`, with role and contact edits."
      >
        <UsersList key={listRefreshKey} />
      </OwnerSettingsPanel>
    </div>
  );
}
