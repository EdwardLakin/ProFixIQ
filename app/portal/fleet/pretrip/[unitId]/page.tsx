import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PretripForm from "@/features/fleet/components/PretripForm";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

type Props = {
  params: Promise<{ unitId: string }>;
  searchParams: Promise<{ fleetId?: string }>;
};

export default async function FleetPortalPretripPage({ params, searchParams }: Props) {
  const [{ unitId }, query] = await Promise.all([params, searchParams]);
  const supabase = createServerSupabaseRSC();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId: query.fleetId ?? null,
  });
  if (!actor.userId || !actor.capabilities.canCreatePretripReports) {
    redirect("/portal/auth/fleet-sign-in");
  }

  const fleetId = query.fleetId ?? actor.primaryFleetId;
  if (!fleetId || (!actor.isInternal && !actor.fleetIds.includes(fleetId))) {
    notFound();
  }

  const [{ data: enrollment }, { data: profile }, { data: assignment }] = await Promise.all([
    supabase
      .from("fleet_vehicles")
      .select("vehicle_id,nickname,vehicles!inner(unit_number,license_plate,vin)")
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId)
      .or("active.is.null,active.eq.true")
      .maybeSingle(),
    supabase.from("profiles").select("full_name,email").eq("id", actor.userId).maybeSingle(),
    supabase
      .from("fleet_dispatch_assignments")
      .select("id")
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId)
      .eq("driver_profile_id", actor.userId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!enrollment || (!actor.isInternal && !assignment)) notFound();

  const vehicle = enrollment.vehicles as unknown as {
    unit_number: string | null;
    license_plate: string | null;
    vin: string | null;
  };
  const label = enrollment.nickname || vehicle.unit_number || vehicle.license_plate || vehicle.vin || "Unit";
  const driverHint = profile?.full_name || profile?.email || null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 text-[color:var(--theme-text-primary)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Fleet driver</p>
          <h1 className="mt-1 text-2xl font-semibold">{label}</h1>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Today’s inspection, meter readings, and defects stay attached to this unit.
          </p>
        </div>
        <Link href="/portal/fleet" className="rounded-xl border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs font-semibold">
          Fleet home
        </Link>
      </div>
      <PretripForm unitId={unitId} fleetId={fleetId} driverHint={driverHint} />
    </main>
  );
}
