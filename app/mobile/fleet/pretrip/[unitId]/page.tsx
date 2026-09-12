import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import PretripForm from "@/features/fleet/components/PretripForm";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { loadFleetPretripContext } from "@/features/fleet/server/loadFleetPretripContext";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ fleetId?: string; driver?: string }>;
};

export default async function MobileFleetPretripPage({
  params,
  searchParams,
}: Props) {
  const [{ unitId }, query] = await Promise.all([params, searchParams]);
  if (!unitId) notFound();

  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: query.fleetId ?? null,
  });
  if (!actor.userId || !actor.capabilities.canCreatePretripReports) {
    redirect("/portal/auth/fleet-sign-in");
  }

  const fleetId = query.fleetId ?? actor.primaryFleetId;
  const scope = resolveFleetActorScope(actor, {
    explicitFleetId: fleetId,
    preferMembershipFleet: true,
  });
  if (
    !fleetId ||
    !scope?.shopId ||
    (!actor.isInternal && !actor.fleetIds.includes(fleetId))
  ) {
    notFound();
  }

  // This page used to hardcode the built-in walk-around, so a fleet running its
  // own published template — including one imported from its paper form — still
  // saw ProFixIQ's generic rows here while the portal showed the real one.
  const context = await loadFleetPretripContext(createAdminSupabase(), {
    shopId: scope.shopId,
    fleetId,
    unitId,
    userId: actor.userId,
  });
  if (!context.enrollment || (!actor.isInternal && !context.isAssignedDriver)) {
    notFound();
  }

  const driverHint = query.driver || context.driverHint;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col bg-[color:var(--theme-surface-page)] px-3 py-4 text-[color:var(--theme-text-primary)]">
      <div className="mb-3">
        <Link
          href={`/mobile/fleet/pretrip${
            fleetId ? `?fleetId=${encodeURIComponent(fleetId)}` : ""
          }`}
          className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
        >
          ← Select unit
        </Link>
      </div>

      <header className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
          Daily Pre-trip
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div
              className="text-lg font-semibold text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Unit {context.unitLabel}
            </div>
            {driverHint ? (
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Logged in as{" "}
                <span className="font-semibold text-[color:var(--theme-text-primary)]">
                  {driverHint}
                </span>
              </p>
            ) : null}
          </div>

          <span className="inline-flex items-center rounded-full border border-[color:var(--accent-copper-soft,#7E4023)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light,#E39A6E)] shadow-[var(--theme-shadow-medium)]">
            Compliance • HD Fleet
          </span>
        </div>
        <p className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
          {context.template.name} · v{context.template.version}. Complete this
          walk-around before leaving the yard. Defects can be converted to
          service requests by dispatch.
        </p>
      </header>

      <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <PretripForm
          unitId={unitId}
          fleetId={fleetId}
          driverHint={driverHint}
          template={context.template}
          trailers={context.trailers}
        />
      </div>
    </main>
  );
}
