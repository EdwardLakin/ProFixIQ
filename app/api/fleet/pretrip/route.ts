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

type FleetPretripReportRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type PretripJoinedRow = FleetPretripReportRow & {
  vehicles: Pick<VehicleRow, "unit_number" | "license_plate" | "vin"> | null;
};

type PretripReport = {
  id: string;
  shop_id: string | null;
  unit_id: string | null;
  unit_label: string | null;
  plate: string | null;
  driver_name: string | null;
  has_defects: boolean | null;
  inspection_date: string | null;
  created_at: string;
  status: string | null;
};

type CreatePretripBody = {
  unitId: string;
  driverName: string;
  odometer: string | null;
  location: string | null;
  notes: string | null;
  defects: Record<string, "ok" | "defect" | "na">;
};

type ListPretripBody = {
  shopId?: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const raw = (await req
    .json()
    .catch(() => ({}))) as Partial<CreatePretripBody & ListPretripBody>;

  // ───────── Creation mode (mobile / portal pre-trip) ─────────
  if (typeof raw.unitId === "string") {
    const body: CreatePretripBody = {
      unitId: raw.unitId,
      driverName: raw.driverName ?? "",
      odometer: raw.odometer ?? null,
      location: raw.location ?? null,
      notes: raw.notes ?? null,
      defects: raw.defects ?? {},
    };

    try {
      const actor = await resolveFleetActorContext(supabase);
      const scope = resolveFleetActorScope(actor);
      if (
        !scope?.fleetId ||
        !actor.userId ||
        !actor.capabilities.canCreatePretripReports
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Look up vehicle from fleet enrollment context (no raw vehicle lookup trust)
      const { data: vehicleMembership, error: vehicleMembershipError } =
        await supabase
          .from("fleet_vehicles")
          .select("vehicle_id, fleet_id")
          .eq("fleet_id", scope.fleetId)
          .eq("vehicle_id", body.unitId)
          .or("active.is.null,active.eq.true")
          .maybeSingle();

      if (vehicleMembershipError || !vehicleMembership?.vehicle_id) {
        return NextResponse.json(
          { error: "Vehicle is not available in your fleet." },
          { status: 403 },
        );
      }

      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("id", body.unitId)
        .single();

      if (vehicleError || !vehicle) {
        return NextResponse.json(
          { error: "Vehicle not found for pre-trip." },
          { status: 404 },
        );
      }

      const hasDefects =
        Object.values(body.defects ?? {}).some((v) => v === "defect") ?? false;

      const checklist = {
        defects: body.defects ?? {},
        location: body.location,
        source: "mobile_pretrip_v1",
      };

      // Persist status based on defects
      const status: FleetPretripReportRow["status"] = hasDefects
        ? "open"
        : "reviewed";

      const { data: inserted, error: insertError } = await supabase
        .from("fleet_pretrip_reports")
        .insert({
          fleet_id: scope.fleetId,
          shop_id: scope.shopId,
          vehicle_id: vehicle.id,
          driver_profile_id: actor.userId,
          driver_name: body.driverName,
          odometer_km: body.odometer ? Number(body.odometer) : null,
          checklist,
          notes: body.notes,
          has_defects: hasDefects,
          status,
        })
        .select("id, has_defects, status")
        .single();

      if (insertError || !inserted) {
        // eslint-disable-next-line no-console
        console.error("[fleet/pretrip] insert error", insertError);
        return NextResponse.json(
          { error: "Failed to save pre-trip report." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        id: inserted.id,
        hasDefects: inserted.has_defects ?? hasDefects,
        status: inserted.status ?? status,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[fleet/pretrip] create error", err);
      return NextResponse.json(
        { error: "Failed to save pre-trip report." },
        { status: 500 },
      );
    }
  }

  // ───────── Listing mode (shop dashboard) ─────────
  const body: ListPretripBody = {
    shopId: raw.shopId ?? null,
  };

  try {
    const actor = await resolveFleetActorContext(supabase);
    const scope = resolveFleetActorScope(actor, {
      explicitShopId: body.shopId ?? null,
    });

    if (!scope?.shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for pre-trip reports." },
        { status: 400 },
      );
    }

    let query = supabase
      .from("fleet_pretrip_reports")
      .select(
        `
        id,
        shop_id,
        vehicle_id,
        driver_name,
        has_defects,
        inspection_date,
        created_at,
        status,
        vehicles!inner (
          unit_number,
          license_plate,
          vin
        )
      `,
      )
      .order("inspection_date", { ascending: false })
      .limit(250);

    if (scope.fleetId) {
      query = query.eq("fleet_id", scope.fleetId);
    } else {
      query = query.eq("shop_id", scope.shopId);
    }

    const { data: rows, error } = await query;

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[fleet/pretrip] list error", error);
      return NextResponse.json(
        { error: "Failed to load pre-trip reports." },
        { status: 500 },
      );
    }

    const typedRows = (rows ?? []) as unknown as PretripJoinedRow[];

    const reports: PretripReport[] = typedRows.map((row) => {
      const vehicle = row.vehicles;

      const unitLabel =
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        row.vehicle_id ||
        null;

      // Fallback to derived status if null (for legacy rows)
      const derivedStatus = row.status ?? (row.has_defects ? "open" : "reviewed");

      return {
        id: row.id,
        shop_id: row.shop_id,
        unit_id: row.vehicle_id,
        unit_label: unitLabel,
        plate: vehicle?.license_plate ?? null,
        driver_name: row.driver_name,
        has_defects: row.has_defects,
        inspection_date: row.inspection_date,
        created_at: row.created_at,
        status: derivedStatus,
      };
    });

    return NextResponse.json({ reports });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fleet/pretrip] list error", err);
    return NextResponse.json(
      { error: "Failed to load pre-trip reports." },
      { status: 500 },
    );
  }
}
