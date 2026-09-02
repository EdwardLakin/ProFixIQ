import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClipboardCheck, Truck } from "lucide-react";

import { requireFleetPortalActor } from "../_lib/requireFleetPortalActor";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type Props = { searchParams: Promise<{ fleetId?: string }> };

export default async function FleetPretripStartPage({ searchParams }: Props) {
  const { fleetId } = await searchParams;
  const [actor, requestHeaders] = await Promise.all([
    requireFleetPortalActor(fleetId ?? null),
    headers(),
  ]);
  if (actor.actorType !== "fleet_driver" || !actor.primaryFleetId) {
    redirect("/portal/fleet");
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("fleet_dispatch_assignments")
    .select("id,vehicle_id,unit_label,route_label,state")
    .eq("fleet_id", actor.primaryFleetId)
    .eq("driver_profile_id", actor.userId)
    .eq("active", true)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error("Assigned assets could not be loaded.");

  const assignments = data ?? [];
  const productHost =
    requestHeaders.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    );

  if (assignments.length === 1) {
    const assignment = assignments[0];
    redirect(
      `${productHost ? "/pre-trips/start" : "/portal/fleet/pretrip"}/${assignment.vehicle_id}?fleetId=${actor.primaryFleetId}`,
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 pb-24 lg:pb-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-500 dark:text-sky-300">
          Driver inspection
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Choose today’s asset
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Select the unit you are inspecting or reporting an issue against.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {assignments.map((assignment) => (
          <Link
            key={assignment.id}
            href={`${productHost ? "/pre-trips/start" : "/portal/fleet/pretrip"}/${assignment.vehicle_id}?fleetId=${actor.primaryFleetId}`}
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-soft)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/10 text-sky-500 dark:text-sky-300">
              <Truck className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {assignment.unit_label || "Assigned unit"}
              </span>
              <span className="mt-1 block truncate text-xs text-[color:var(--theme-text-muted)]">
                {assignment.route_label || "No route assigned"}
              </span>
            </span>
            <ClipboardCheck className="h-5 w-5 text-sky-500" />
          </Link>
        ))}
      </section>

      {!assignments.length ? (
        <div className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-8 text-center">
          <Truck className="mx-auto h-8 w-8 text-[color:var(--theme-text-muted)]" />
          <h2 className="mt-3 font-semibold">No active assignment</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Dispatch must assign an asset before you can submit its inspection.
          </p>
        </div>
      ) : null}
    </main>
  );
}
