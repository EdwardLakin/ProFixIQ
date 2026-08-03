// app/api/fleet/pretrip/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;
type FleetPretripReportRow = DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type PretripJoinedRow = FleetPretripReportRow & {
  vehicles: Pick<VehicleRow, "unit_number" | "license_plate" | "vin"> | null;
};

type CreatePretripBody = {
  unitId: string;
  fleetId: string | null;
  driverName: string;
  odometer: string | null;
  engineHours: string | null;
  readingCorrectionReason: string | null;
  location: string | null;
  notes: string | null;
  defects: Record<string, "ok" | "defect" | "na">;
};

type ListPretripBody = { shopId?: string | null; fleetId?: string | null };

function numericInput(value: string | null, label: string) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative number.`);
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const raw = (await req.json().catch(() => ({}))) as Partial<CreatePretripBody & ListPretripBody>;

  if (typeof raw.unitId === "string") {
    try {
      const actor = await resolveFleetActorContext(supabase, {
        requestedFleetId: raw.fleetId ?? null,
      });
      if (!actor.userId || !actor.capabilities.canCreatePretripReports) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      let fleetId = raw.fleetId ?? actor.primaryFleetId ?? null;
      let scope = resolveFleetActorScope(actor, {
        explicitFleetId: fleetId,
        preferMembershipFleet: true,
      });

      if (!fleetId && actor.isInternal && actor.shopId) {
        const { data: enrollment } = await supabase
          .from("fleet_vehicles")
          .select("fleet_id")
          .eq("shop_id", actor.shopId)
          .eq("vehicle_id", raw.unitId)
          .or("active.is.null,active.eq.true")
          .limit(1)
          .maybeSingle();
        fleetId = enrollment?.fleet_id ?? null;
        scope = resolveFleetActorScope(actor, { explicitFleetId: fleetId });
      }

      if (!fleetId || !scope?.shopId) {
        return NextResponse.json({ error: "Fleet scope is required for this unit." }, { status: 403 });
      }

      const { data: vehicleMembership, error: membershipError } = await supabase
        .from("fleet_vehicles")
        .select("vehicle_id")
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", raw.unitId)
        .or("active.is.null,active.eq.true")
        .maybeSingle();
      if (membershipError || !vehicleMembership) {
        return NextResponse.json({ error: "Vehicle is not available in your fleet." }, { status: 403 });
      }

      const driverName = raw.driverName?.trim();
      if (!driverName) {
        return NextResponse.json({ error: "Driver name is required." }, { status: 400 });
      }
      const odometer = numericInput(raw.odometer ?? null, "Odometer");
      const engineHours = numericInput(raw.engineHours ?? null, "Engine hours");
      const correctionReason = raw.readingCorrectionReason?.trim() || null;
      const defects = raw.defects ?? {};
      const hasDefects = Object.values(defects).some((value) => value === "defect");
      const status: FleetPretripReportRow["status"] = hasDefects ? "open" : "reviewed";

      const { data: inserted, error: insertError } = await supabase
        .from("fleet_pretrip_reports")
        .insert({
          fleet_id: fleetId,
          shop_id: scope.shopId,
          vehicle_id: raw.unitId,
          driver_profile_id: actor.userId,
          driver_name: driverName,
          odometer_km: odometer,
          checklist: {
            defects,
            location: raw.location?.trim() || null,
            engineHours,
            readingCorrectionReason: correctionReason,
            source: "fleet_pretrip_v2",
          },
          notes: raw.notes?.trim() || null,
          has_defects: hasDefects,
          status,
        })
        .select("id,has_defects,status")
        .single();

      if (insertError || !inserted) {
        const message = insertError?.message ?? "Failed to save pre-trip report.";
        if (insertError?.code === "23505") {
          return NextResponse.json(
            { error: "Today’s pre-trip is already complete for this driver and unit." },
            { status: 409 },
          );
        }
        if (/below the latest reading/i.test(message)) {
          return NextResponse.json(
            { error: message, requiresCorrectionReason: true },
            { status: 409 },
          );
        }
        console.error("[fleet/pretrip] insert error", insertError);
        return NextResponse.json({ error: "Failed to save pre-trip report." }, { status: 500 });
      }

      const { error: pmEvaluationError } = await supabase.rpc("evaluate_fleet_pm_due_events", {
        p_fleet_id: fleetId,
        p_vehicle_id: raw.unitId,
      });
      if (pmEvaluationError) {
        console.error("[fleet/pretrip] PM evaluation deferred", pmEvaluationError);
      }

      return NextResponse.json({
        id: inserted.id,
        hasDefects: inserted.has_defects ?? hasDefects,
        status: inserted.status ?? status,
        defectCount: Object.values(defects).filter((value) => value === "defect").length,
        pmEvaluationQueued: !pmEvaluationError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save pre-trip report.";
      const status = /must be a valid/i.test(message) ? 400 : 500;
      console.error("[fleet/pretrip] create error", error);
      return NextResponse.json({ error: message }, { status });
    }
  }

  try {
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: raw.fleetId ?? null,
    });
    const scope = resolveFleetActorScope(actor, {
      explicitShopId: raw.shopId ?? null,
      explicitFleetId: raw.fleetId ?? null,
      preferMembershipFleet: true,
    });
    if (!scope?.shopId) {
      return NextResponse.json({ error: "Unable to resolve fleet for pre-trip reports." }, { status: 400 });
    }

    let query = supabase
      .from("fleet_pretrip_reports")
      .select(`id,shop_id,vehicle_id,driver_name,has_defects,inspection_date,created_at,status,vehicles!inner(unit_number,license_plate,vin)`)
      .order("inspection_date", { ascending: false })
      .limit(250);
    query = scope.fleetIds?.length
      ? query.in("fleet_id", scope.fleetIds)
      : query.eq("shop_id", scope.shopId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const reports = ((data ?? []) as unknown as PretripJoinedRow[]).map((row) => {
      const vehicle = row.vehicles;
      return {
        id: row.id,
        shop_id: row.shop_id,
        unit_id: row.vehicle_id,
        unit_label: vehicle?.unit_number || vehicle?.license_plate || vehicle?.vin || row.vehicle_id,
        plate: vehicle?.license_plate ?? null,
        driver_name: row.driver_name,
        has_defects: row.has_defects,
        inspection_date: row.inspection_date,
        created_at: row.created_at,
        status: row.status ?? (row.has_defects ? "open" : "reviewed"),
      };
    });
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[fleet/pretrip] list error", error);
    return NextResponse.json({ error: "Failed to load pre-trip reports." }, { status: 500 });
  }
}
