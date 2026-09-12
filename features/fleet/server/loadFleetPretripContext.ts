import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  normalizeFleetPretripTemplateSections,
  type FleetPretripTemplate,
  type FleetTrailerOption,
} from "@/features/fleet/types/driverPortal";

type TemplateAssignmentRow = {
  id: string;
  inspection_template_id: string;
  vehicle_type: string;
  version: number;
  inspection_templates:
    | { template_name: string; sections: unknown }
    | Array<{ template_name: string; sections: unknown }>
    | null;
};

type EnrolledVehicleRow = {
  vehicle_id: string;
  nickname: string | null;
  vehicles:
    | {
        unit_number: string | null;
        license_plate: string | null;
        vin: string | null;
        asset_type: string | null;
        body_type: string | null;
      }
    | Array<{
        unit_number: string | null;
        license_plate: string | null;
        vin: string | null;
        asset_type: string | null;
        body_type: string | null;
      }>
    | null;
};

// Vehicle types that mean "every unit in this fleet" rather than naming one
// asset type. "mixed" is what the form importer's uploader calls a mixed
// fleet, and an assignment published under it must not be unreachable.
const ANY_VEHICLE_TYPES = [
  "all",
  "any",
  "all fleet assets",
  "fleet asset",
  "fleet assets",
  "mixed",
  "mixed fleet",
];

function joined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function vehicleLabelFor(row: EnrolledVehicleRow): string {
  const vehicle = joined(row.vehicles);
  return (
    row.nickname ||
    vehicle?.unit_number ||
    vehicle?.license_plate ||
    vehicle?.vin ||
    "Unit"
  );
}

export function vehicleTypeFor(row: EnrolledVehicleRow): string {
  const vehicle = joined(row.vehicles);
  return vehicle?.asset_type || vehicle?.body_type || "Fleet asset";
}

/**
 * Pick the active pre-trip template a given vehicle type should run: an exact
 * vehicle-type match first, then a fleet-wide assignment, and only the built-in
 * walk-around when the fleet has published neither.
 *
 * Both driver surfaces resolve this the same way. The mobile pre-trip page used
 * to hardcode the built-in default, so a fleet that had published its own
 * template (including one imported from its paper form) still saw ProFixIQ's
 * eight generic rows there.
 */
export function selectFleetPretripTemplate(
  assignments: TemplateAssignmentRow[] | null | undefined,
  vehicleType: string,
): FleetPretripTemplate {
  const rows = assignments ?? [];
  const normalized = vehicleType.trim().toLowerCase();
  const match =
    rows.find((row) => row.vehicle_type.toLowerCase() === normalized) ??
    rows.find((row) =>
      ANY_VEHICLE_TYPES.includes(row.vehicle_type.toLowerCase()),
    );
  const template = match ? joined(match.inspection_templates) : null;
  const sections = normalizeFleetPretripTemplateSections(template?.sections);

  if (!match || !template || !sections.length) {
    return DEFAULT_FLEET_PRETRIP_TEMPLATE;
  }
  return {
    assignmentId: match.id,
    templateId: match.inspection_template_id,
    name: template.template_name,
    vehicleType: match.vehicle_type,
    version: match.version,
    sections,
  };
}

export function fleetTrailerOptions(
  rows: EnrolledVehicleRow[] | null | undefined,
  excludeVehicleId: string,
): FleetTrailerOption[] {
  return (rows ?? [])
    .flatMap((row) => {
      const trailer = joined(row.vehicles);
      const type = (trailer?.asset_type || trailer?.body_type || "")
        .toLowerCase();
      if (!trailer || !type.includes("trailer") || row.vehicle_id === excludeVehicleId) {
        return [];
      }
      return [{ id: row.vehicle_id, label: vehicleLabelFor(row) }];
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export type FleetPretripContext = {
  enrollment: EnrolledVehicleRow | null;
  isAssignedDriver: boolean;
  driverHint: string | null;
  unitLabel: string;
  vehicleType: string;
  template: FleetPretripTemplate;
  trailers: FleetTrailerOption[];
};

/**
 * Load everything a driver pre-trip surface needs for one unit: the driver's
 * enrolment, their dispatch assignment, the template their fleet has published
 * for that vehicle type, and the trailers they can couple to.
 */
export async function loadFleetPretripContext(
  admin: SupabaseClient,
  args: { shopId: string; fleetId: string; unitId: string; userId: string },
): Promise<FleetPretripContext> {
  const vehicleSelect =
    "vehicle_id,nickname,vehicles!inner(unit_number,license_plate,vin,asset_type,body_type)";

  const [
    enrollmentResult,
    profileResult,
    assignmentResult,
    trailerResult,
    templateResult,
  ] = await Promise.all([
    admin
      .from("fleet_vehicles")
      .select(vehicleSelect)
      .eq("shop_id", args.shopId)
      .eq("fleet_id", args.fleetId)
      .eq("vehicle_id", args.unitId)
      .or("active.is.null,active.eq.true")
      .maybeSingle(),
    admin
      .from("profiles")
      .select("full_name,email")
      .eq("id", args.userId)
      .maybeSingle(),
    admin
      .from("fleet_dispatch_assignments")
      .select("id")
      .eq("shop_id", args.shopId)
      .eq("fleet_id", args.fleetId)
      .eq("vehicle_id", args.unitId)
      .eq("driver_profile_id", args.userId)
      .eq("active", true)
      .maybeSingle(),
    admin
      .from("fleet_vehicles")
      .select(vehicleSelect)
      .eq("shop_id", args.shopId)
      .eq("fleet_id", args.fleetId)
      .or("active.is.null,active.eq.true"),
    admin
      .from("fleet_pretrip_template_assignments")
      .select(
        "id,inspection_template_id,vehicle_type,version,inspection_templates!inner(template_name,sections)",
      )
      .eq("shop_id", args.shopId)
      .eq("fleet_id", args.fleetId)
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

  const enrollment = (enrollmentResult.data ?? null) as EnrolledVehicleRow | null;
  const profile = profileResult.data as
    | { full_name: string | null; email: string | null }
    | null;
  const vehicleType = enrollment ? vehicleTypeFor(enrollment) : "Fleet asset";

  return {
    enrollment,
    isAssignedDriver: Boolean(assignmentResult.data),
    driverHint: profile?.full_name || profile?.email || null,
    unitLabel: enrollment ? vehicleLabelFor(enrollment) : "Unit",
    vehicleType,
    template: selectFleetPretripTemplate(
      templateResult.data as TemplateAssignmentRow[] | null,
      vehicleType,
    ),
    trailers: fleetTrailerOptions(
      trailerResult.data as EnrolledVehicleRow[] | null,
      args.unitId,
    ),
  };
}
