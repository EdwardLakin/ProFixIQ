import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import PretripForm from "@/features/fleet/components/PretripForm";
import { loadFleetPretripContext } from "@/features/fleet/server/loadFleetPretripContext";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";
import {
  createAdminSupabase,
  createServerSupabaseRSC,
} from "@/features/shared/lib/supabase/server";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ fleetId?: string; mode?: string }>;
};

export default async function FleetPortalPretripPage({
  params,
  searchParams,
}: Props) {
  const [{ unitId }, query] = await Promise.all([params, searchParams]);
  const supabase = createServerSupabaseRSC();
  const [actor, requestHeaders] = await Promise.all([
    resolveFleetActorContext(supabase, {
      requestedFleetId: query.fleetId ?? null,
    }),
    headers(),
  ]);
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

  // Both driver surfaces resolve the unit, its published template and its
  // trailers the same way, so they cannot drift apart again.
  const context = await loadFleetPretripContext(createAdminSupabase(), {
    shopId: scope.shopId,
    fleetId,
    unitId,
    userId: actor.userId,
  });
  if (!context.enrollment || (!actor.isInternal && !context.isAssignedDriver)) {
    notFound();
  }

  const { driverHint, template, trailers, unitLabel: label } = context;
  const productHost =
    requestHeaders.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Fleet driver
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{label}</h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Today’s inspection, meter readings, and defects stay attached to
            this unit.
          </p>
        </div>
        <Link
          href={productHost ? "/" : "/portal/fleet"}
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold"
        >
          Fleet home
        </Link>
      </div>
      <PretripForm
        unitId={unitId}
        fleetId={fleetId}
        driverHint={driverHint}
        template={template}
        trailers={trailers}
        defectMode={query.mode === "defect"}
      />
    </main>
  );
}
