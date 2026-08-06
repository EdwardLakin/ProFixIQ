import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import PretripForm from "@/features/fleet/components/PretripForm";
import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  normalizeFleetPretripTemplateSections,
  type FleetPretripTemplate,
} from "@/features/fleet/types/driverPortal";
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

  const admin = createAdminSupabase();
  const [
    enrollmentResult,
    profileResult,
    assignmentResult,
    trailerResult,
    templateResult,
  ] = await Promise.all([
    admin
      .from("fleet_vehicles")
      .select(
        "vehicle_id,nickname,vehicles!inner(unit_number,license_plate,vin,asset_type,body_type)",
      )
      .eq("shop_id", scope.shopId)
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId)
      .or("active.is.null,active.eq.true")
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name,email")
      .eq("id", actor.userId)
      .maybeSingle(),
    admin
      .from("fleet_dispatch_assignments")
      .select("id")
      .eq("shop_id", scope.shopId)
      .eq("fleet_id", fleetId)
      .eq("vehicle_id", unitId)
      .eq("driver_profile_id", actor.userId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("fleet_vehicles")
      .select(
        "vehicle_id,nickname,vehicles!inner(unit_number,license_plate,vin,asset_type,body_type)",
      )
      .eq("shop_id", scope.shopId)
      .eq("fleet_id", fleetId)
      .or("active.is.null,active.eq.true"),
    admin
      .from("fleet_pretrip_template_assignments")
      .select(
        "id,inspection_template_id,vehicle_type,version,inspection_templates!inner(template_name,sections)",
      )
      .eq("shop_id", scope.shopId)
      .eq("fleet_id", fleetId)
      .eq("active", true),
  ]);
  const firstError = [
    enrollmentResult.error,
    profileResult.error,
    assignmentResult.error,
    trailerResult.error,
    templateResult.error,
  ].find(Boolean);
  if (firstError) throw new Error("The driver inspection could not be loaded.");

  const enrollment = enrollmentResult.data;
  const profile = profileResult.data;
  const assignment = assignmentResult.data;
  const trailerRows = trailerResult.data;
  const templateRows = templateResult.data;
  if (!enrollment || (!actor.isInternal && !assignment)) notFound();

  const vehicle = enrollment.vehicles as unknown as {
    unit_number: string | null;
    license_plate: string | null;
    vin: string | null;
    asset_type: string | null;
    body_type: string | null;
  };
  const label =
    enrollment.nickname ||
    vehicle.unit_number ||
    vehicle.license_plate ||
    vehicle.vin ||
    "Unit";
  const driverHint = profile?.full_name || profile?.email || null;
  const vehicleType = vehicle.asset_type || vehicle.body_type || "Fleet asset";
  const normalizedVehicleType = vehicleType.toLowerCase();
  const templateMatch =
    (templateRows ?? []).find(
      (row) => row.vehicle_type.toLowerCase() === normalizedVehicleType,
    ) ??
    (templateRows ?? []).find((row) =>
      ["all", "all fleet assets", "fleet asset"].includes(
        row.vehicle_type.toLowerCase(),
      ),
    );
  const joinedTemplate = templateMatch
    ? Array.isArray(templateMatch.inspection_templates)
      ? templateMatch.inspection_templates[0]
      : templateMatch.inspection_templates
    : null;
  const customSections = normalizeFleetPretripTemplateSections(
    joinedTemplate?.sections,
  );
  const template: FleetPretripTemplate =
    templateMatch && joinedTemplate && customSections.length
      ? {
          assignmentId: templateMatch.id,
          templateId: templateMatch.inspection_template_id,
          name: joinedTemplate.template_name,
          vehicleType: templateMatch.vehicle_type,
          version: templateMatch.version,
          sections: customSections,
        }
      : DEFAULT_FLEET_PRETRIP_TEMPLATE;
  const trailers = (trailerRows ?? [])
    .flatMap((row) => {
      const trailer = Array.isArray(row.vehicles)
        ? row.vehicles[0]
        : row.vehicles;
      const type = (
        trailer?.asset_type ||
        trailer?.body_type ||
        ""
      ).toLowerCase();
      if (!trailer || !type.includes("trailer") || row.vehicle_id === unitId) {
        return [];
      }
      return [
        {
          id: row.vehicle_id,
          label:
            row.nickname ||
            trailer.unit_number ||
            trailer.license_plate ||
            trailer.vin ||
            "Trailer",
        },
      ];
    })
    .sort((left, right) => left.label.localeCompare(right.label));
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
