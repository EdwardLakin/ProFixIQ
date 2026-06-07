// features/dashboard/app/dashboard/owner/create-user/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import UsersList from "@/features/admin/components/UsersList";
import InviteCandidatesList from "@/features/admin/components/InviteCandidatesList";
import { GuidedOnboardingStepCard } from "@/features/onboarding-v2/components/GuidedOnboardingStepCard";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import {
  buildShopUsernameNamespace,
  buildUsernameSuggestions,
  normalizeProvisioningUsername,
} from "@/features/users/lib/username";

type UserRole = Database["public"]["Enums"]["user_role_enum"];

type CreatePayload = {
  username: string;
  password: string;
  email?: string | null;
  full_name?: string | null;
  role?: UserRole | null;
  shop_id?: string | null;
  phone?: string | null;
};

const COPPER = "#C57A4A";
const PANEL_CLASS =
  "rounded-2xl border border-[color:var(--metal-border-soft,#334155)] bg-[linear-gradient(180deg,rgba(2,6,23,0.92),rgba(2,6,23,0.8))] p-4 backdrop-blur-md shadow-[0_22px_60px_rgba(0,0,0,0.72)] sm:p-6";
const INPUT_CLASS =
  "w-full rounded-lg border border-[color:var(--metal-border-soft,#334155)] bg-slate-950/80 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)] focus:border-[var(--metal-border-strong,#64748b)]";

export default function CreateUserPage(): JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState<CreatePayload>({
    username: "",
    password: "",
    email: "",
    full_name: "",
    role: "mechanic",
    shop_id: null,
    phone: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [createdPersonHref, setCreatedPersonHref] = useState<string | null>(null);
  const [openPeopleAfterCreate, setOpenPeopleAfterCreate] = useState(true);

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
  const [creatorShopName, setCreatorShopName] = useState<string | null>(null);
  const [usernameTouched, setUsernameTouched] = useState(false);

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
        const { data: shop } = await supabase
          .from("shops")
          .select("name, shop_name")
          .eq("id", shopId)
          .maybeSingle<{ name: string | null; shop_name: string | null }>();

        const displayName = (shop?.shop_name ?? "").trim() || (shop?.name ?? "").trim() || null;
        setCreatorShopName(displayName);

        setForm((prev) => ({
          ...prev,
          shop_id: shopId,
        }));
      }
    };

    void load();
  }, []);

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

      const payload = (await res.json().catch(() => null)) as
        | { error?: string; user_id?: string; username?: string; email?: string | null; auth_email?: string; people_record_href?: string }
        | null;

      if (!res.ok) throw new Error(payload?.error || "Failed to create user.");

      const createdUsername = payload?.username ?? body.username;
      const createdEmail = payload?.email ?? null;

      // local feedback
      setSuccess(
        `User "${createdUsername}" created. They can sign in with the exact username "${createdUsername}" and the password entered here.${
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

      // clear sensitive fields
      setForm((f) => ({
        ...f,
        username: "",
        password: "",
        email: "",
        full_name: "",
        phone: "",
        shop_id: body.shop_id ?? creatorShopId ?? null,
      }));
      setUsernameTouched(false);

      // refresh list below
      setListRefreshKey((k) => k + 1);

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
      const uname = resetUsername.trim().toLowerCase();
      const tmp = resetPass;

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
      title="Create User (Access Provisioning)"
      description="Provision account access, assign the initial role, and link the person to your shop. Complete workforce/profile setup in People."
    >
      <GuidedOnboardingStepCard stepKey="staff" surface="staff" className="mb-6" />
      {/* top 2-column content */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: create user */}
        <div className={`space-y-4 ${PANEL_CLASS}`}>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">New team member</h2>
            <p className="text-sm text-neutral-400">
              This step provisions access only: create login credentials, set an
              initial role, and link the person to your shop. For{" "}
              <span style={{ color: COPPER }}>
                workforce profile, certifications, payroll readiness, and ongoing
                staff management
              </span>
              , continue in People after create.
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
                  {success}{" "}
                  {createdPersonHref ? (
                    <button
                      type="button"
                      onClick={() => router.push(createdPersonHref)}
                      className="ml-2 underline underline-offset-2"
                    >
                      Open People record →
                    </button>
                  ) : null}
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
                className={INPUT_CLASS}
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
                className={INPUT_CLASS}
                placeholder="Phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Contact email
              </label>
              <input
                className={INPUT_CLASS}
                placeholder="technician@example.com"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <p className="text-[11px] text-neutral-500">
                Stored on the profile for contact only. Username remains the staff sign-in identity.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                className={INPUT_CLASS}
                placeholder="e.g. ProFixLucas"
                value={form.username}
                onChange={(e) => {
                  setUsernameTouched(true);
                  setForm({ ...form, username: e.target.value });
                }}
              />
              <p className="text-[11px] text-neutral-500">
                Username is normalized to letters/numbers and shop-prefixed for collision-safe login.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-300">
                Temporary password <span className="text-red-400">*</span>
              </label>
              <input
                className={INPUT_CLASS}
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
                className={INPUT_CLASS}
                value={form.role ?? ""}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as UserRole })
                }
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="foreman">Foreman</option>
                <option value="lead_hand">Lead Hand</option>
                <option value="advisor">Advisor</option>
                <option value="mechanic">Mechanic / Technician</option>
                <option value="parts">Parts</option>
                <option value="driver">Driver</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="fleet_manager">Fleet manager</option>
              </select>
              <p className="text-[11px] text-neutral-500">
                App role controls access and permissions. Workforce title/category is managed
                separately in the People profile. Use{" "}
                <span style={{ color: COPPER }}>driver / dispatcher / fleet manager</span> for
                Fleet Portal accounts.
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
                className={INPUT_CLASS}
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
            <label className="inline-flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={openPeopleAfterCreate}
                onChange={(e) => setOpenPeopleAfterCreate(e.target.checked)}
              />
              Open People record immediately after create
            </label>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-black shadow-[0_0_26px_rgba(197,122,74,0.85)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create user"}
            </button>
            <p className="text-xs text-neutral-500">
              Next step: complete workforce/profile setup in People, then share
              credentials for first sign-in.
            </p>
          </div>
        </div>

        {/* RIGHT: recents + internal reset */}
        <div className="space-y-6">
          {/* recently created */}
          <div className={PANEL_CLASS}>
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
                    className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--metal-border-soft,#334155)] bg-slate-950/75 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {u.full_name || u.username}
                      </div>
                      <div className="text-xs text-neutral-400">
                        @{u.username} • {u.role ?? "mechanic"}
                      </div>
                    </div>
                    <span className="rounded-full border border-[color:var(--metal-border-soft,#334155)] bg-slate-950/75 px-2 py-0.5 text-[11px] text-neutral-200">
                      temp set
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {createdUserId ? (
              <p className="mt-3 text-xs text-neutral-500">
                Latest person record:{" "}
                <button
                  type="button"
                  className="text-[var(--accent-copper-soft)] hover:text-[var(--accent-copper)]"
                  onClick={() => router.push(`/dashboard/admin/people/${createdUserId}?from=create-user`)}
                >
                  Open workspace
                </button>
              </p>
            ) : null}
          </div>

          {/* reset */}
          <div className={PANEL_CLASS}>
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
                className={INPUT_CLASS}
                placeholder="Username to reset"
                value={resetUsername}
                onChange={(e) => setResetUsername(e.target.value)}
              />
              <input
                className={INPUT_CLASS}
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

      {/* PENDING INVITES */}
      <div className={`mt-6 ${PANEL_CLASS}`}>
        <h2 className="mb-3 text-lg font-semibold text-white">Pending invites</h2>
        <p className="mb-3 text-xs text-neutral-500">
          These are staff invite candidates (imported or staged). Create the user + send the invite email.
        </p>
        <InviteCandidatesList />
      </div>

      {/* USERS LIST (full width, own card) */}
      <div className={`mt-6 ${PANEL_CLASS}`}>
        <h2 className="mb-3 text-lg font-semibold text-white">All users</h2>
        <p className="mb-3 text-xs text-neutral-500">
          This is the full list of users for your shop. New accounts appear here automatically.
        </p>
        <UsersList key={listRefreshKey} />
      </div>
    </PageShell>
  );
}
