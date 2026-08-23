import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Truck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

import {
  removeFleetMember,
  updateFleetMemberRole,
  updateFleetWorkspace,
} from "./actions";
import FleetMemberRemoveButton from "@/features/fleet/components/FleetMemberRemoveButton";
import { canAdministerFleetForActor } from "@/features/fleet/lib/resolveFleetActorContext";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getFleetPortalActorContext } from "../_lib/requireFleetPortalActor";

type PageProps = {
  searchParams: Promise<{
    fleetId?: string;
    saved?: string;
    error?: string;
  }>;
};

type MemberRow = {
  fleet_id: string;
  role: string;
  user_id: string;
};

type ProfileRow = {
  email: string | null;
  full_name: string | null;
  id: string;
};

const panel =
  "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-soft)]";

function roleValue(role: string): "manager" | "dispatcher" | "driver" {
  if (["owner", "admin", "manager", "fleet_manager"].includes(role)) {
    return "manager";
  }
  if (["approver", "dispatcher"].includes(role)) return "dispatcher";
  return "driver";
}

function roleLabel(role: string): string {
  const normalized = roleValue(role);
  if (normalized === "manager") return "Fleet manager";
  if (normalized === "dispatcher") return "Dispatcher";
  return "Driver";
}

export default async function FleetSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const actor = await getFleetPortalActorContext();
  if (!actor.shopId) redirect("/portal/fleet");

  const manageableFleetIds = actor.fleetIds.filter((fleetId) =>
    canAdministerFleetForActor(actor, fleetId),
  );
  const selectedFleetId =
    params.fleetId && manageableFleetIds.includes(params.fleetId)
      ? params.fleetId
      : manageableFleetIds[0];

  if (!selectedFleetId) redirect("/portal/fleet");

  const admin = createAdminSupabase();
  const [fleetListResult, memberResult, unitResult] = await Promise.all([
    admin
      .from("fleets")
      .select(
        "id,name,contact_name,contact_email,contact_phone,notes,shop_id,active",
      )
      .eq("shop_id", actor.shopId)
      .in("id", manageableFleetIds)
      .order("name", { ascending: true }),
    admin
      .from("fleet_members")
      .select("fleet_id,user_id,role")
      .eq("shop_id", actor.shopId)
      .eq("fleet_id", selectedFleetId)
      .order("created_at", { ascending: true }),
    admin
      .from("fleet_vehicles")
      .select("vehicle_id", { count: "exact", head: true })
      .eq("shop_id", actor.shopId)
      .eq("fleet_id", selectedFleetId)
      .eq("active", true),
  ]);

  const firstError = [
    fleetListResult.error,
    memberResult.error,
    unitResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error("Fleet settings could not be loaded.");
  }

  const fleets = fleetListResult.data ?? [];
  const fleet = fleets.find((item) => item.id === selectedFleetId);
  if (!fleet) redirect("/portal/fleet");

  const members = (memberResult.data ?? []) as MemberRow[];
  const memberUserIds = members.map((member) => member.user_id);
  const profileResult = memberUserIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", memberUserIds)
    : { data: [] as ProfileRow[], error: null };
  if (profileResult.error) {
    throw new Error("Fleet members could not be loaded.");
  }

  const profiles = new Map(
    ((profileResult.data ?? []) as ProfileRow[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );
  const managerCount = members.filter(
    (member) => roleValue(member.role) === "manager",
  ).length;
  const savedMessage =
    params.saved === "workspace"
      ? "Fleet workspace updated."
      : params.saved === "member"
        ? "Member permissions updated."
        : params.saved === "removed"
          ? "Member access removed."
          : null;
  const errorMessage = params.error?.slice(0, 240) ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
            Fleet administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
            Fleet Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
            Manage the Fleet workspace and the people who operate it. Shop
            staffing and Shop permissions remain separate.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-xs font-semibold"
        >
          Return to Control Tower
        </Link>
      </header>

      {fleets.length > 1 ? (
        <nav
          aria-label="Fleet workspace selector"
          className="flex gap-2 overflow-x-auto"
        >
          {fleets.map((item) => (
            <Link
              key={item.id}
              href={`/settings?fleetId=${encodeURIComponent(item.id)}`}
              aria-current={item.id === selectedFleetId ? "page" : undefined}
              className={
                item.id === selectedFleetId
                  ? "shrink-0 rounded-xl bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950"
                  : "shrink-0 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2 text-xs font-semibold"
              }
            >
              {item.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {savedMessage ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {savedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
        >
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className={`${panel} p-4`}>
          <Truck className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <div className="mt-3 text-2xl font-semibold">
            {unitResult.count ?? 0}
          </div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            Active assets
          </div>
        </div>
        <div className={`${panel} p-4`}>
          <UsersRound className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <div className="mt-3 text-2xl font-semibold">{members.length}</div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            Fleet users
          </div>
        </div>
        <div className={`${panel} p-4`}>
          <ShieldCheck className="h-4 w-4 text-sky-300" aria-hidden="true" />
          <div className="mt-3 text-2xl font-semibold">{managerCount}</div>
          <div className="text-xs text-[color:var(--theme-text-muted)]">
            Workspace managers
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.95fr)]">
        <form
          action={updateFleetWorkspace}
          className={`${panel} space-y-5 p-5`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Fleet workspace</h2>
              <p className="text-xs text-[color:var(--theme-text-muted)]">
                Organization identity and operating contact
              </p>
            </div>
          </div>

          <input type="hidden" name="fleetId" value={selectedFleetId} />
          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Fleet name
            <input
              required
              name="name"
              defaultValue={fleet.name}
              maxLength={120}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Primary contact
              <input
                name="contactName"
                defaultValue={fleet.contact_name ?? ""}
                maxLength={120}
                className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
              />
            </label>
            <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              Contact phone
              <input
                name="contactPhone"
                type="tel"
                defaultValue={fleet.contact_phone ?? ""}
                maxLength={40}
                className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Contact email
            <input
              name="contactEmail"
              type="email"
              defaultValue={fleet.contact_email ?? ""}
              maxLength={254}
              className="mt-1.5 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
            />
          </label>

          <label className="block text-xs font-semibold text-[color:var(--theme-text-secondary)]">
            Fleet notes
            <textarea
              name="notes"
              defaultValue={fleet.notes ?? ""}
              maxLength={2000}
              rows={5}
              className="mt-1.5 w-full resize-y rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 py-2.5 text-sm text-[color:var(--theme-input-text)]"
            />
          </label>

          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            Save Fleet workspace
          </button>
        </form>

        <section className={`${panel} overflow-hidden`}>
          <div className="border-b border-[color:var(--theme-border-soft)] p-5">
            <div className="flex items-center gap-2">
              <UserRoundCog
                className="h-4 w-4 text-sky-300"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-semibold">Users & roles</h2>
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  Fleet permissions only — never Shop staff permissions
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[color:var(--theme-border-soft)]">
            {members.map((member) => {
              const profile = profiles.get(member.user_id);
              const isCurrentUser = member.user_id === actor.userId;
              const protectedMember = ["owner", "admin"].includes(member.role);
              const editable = !isCurrentUser && !protectedMember;

              return (
                <div key={member.user_id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {profile?.full_name || profile?.email || "Fleet user"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-muted)]">
                        {profile?.email || "No email on profile"}
                      </div>
                    </div>
                    <div className="rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-secondary)]">
                      {isCurrentUser ? "Your account" : roleLabel(member.role)}
                    </div>
                  </div>

                  {editable ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <form
                        action={updateFleetMemberRole}
                        className="flex min-w-0 flex-1 gap-2"
                      >
                        <input
                          type="hidden"
                          name="fleetId"
                          value={selectedFleetId}
                        />
                        <input
                          type="hidden"
                          name="memberUserId"
                          value={member.user_id}
                        />
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">Fleet role</span>
                          <select
                            name="role"
                            defaultValue={roleValue(member.role)}
                            className="h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-xs text-[color:var(--theme-input-text)]"
                          >
                            <option value="manager">Fleet manager</option>
                            <option value="dispatcher">Dispatcher</option>
                            <option value="driver">Driver</option>
                          </select>
                        </label>
                        <button
                          type="submit"
                          className="h-10 rounded-xl border border-sky-300/40 px-3 text-xs font-semibold text-sky-700 dark:text-sky-200"
                        >
                          Update
                        </button>
                      </form>
                      <form action={removeFleetMember}>
                        <input
                          type="hidden"
                          name="fleetId"
                          value={selectedFleetId}
                        />
                        <input
                          type="hidden"
                          name="memberUserId"
                          value={member.user_id}
                        />
                        <FleetMemberRemoveButton />
                      </form>
                    </div>
                  ) : (
                    <p className="text-xs text-[color:var(--theme-text-muted)]">
                      {isCurrentUser
                        ? "Another Fleet manager must change or remove your access."
                        : "Protected owner access is managed through the connected account relationship."}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-xs text-[color:var(--theme-text-secondary)]">
            The initial relationship invitation remains in ProFixIQ Shop. After
            acceptance, Fleet managers control each member’s Fleet-only role
            here.
          </div>
        </section>
      </div>
    </main>
  );
}
