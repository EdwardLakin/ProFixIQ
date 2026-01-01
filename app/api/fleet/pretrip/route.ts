import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// Shape expected by PretripReportsPage
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

async function resolveShopIdForListing(
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>,
  explicitShopId: string | null,
) {
  if (explicitShopId) return explicitShopId;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.shop_id) {
    return null;
  }

  return profile.shop_id;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const raw = await req.json().catch(() => ({}));

  // Creation mode (mobile / portal pre-trip)
  if (raw && typeof raw.unitId === "string") {
    const body = raw as CreatePretripBody;

    try {
      // Look up vehicle to get shop_id
      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, shop_id")
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

      const { data: inserted, error: insertError } = await supabase
        .from("fleet_pretrip_reports")
        .insert({
          shop_id: vehicle.shop_id,
          vehicle_id: vehicle.id,
          driver_profile_id: null, // can be wired to auth profile later
          driver_name: body.driverName,
          odometer_km: body.odometer ? Number(body.odometer) : null,
          checklist,
          notes: body.notes,
          has_defects: hasDefects,
          // inspection_date, source, created_at use defaults
        })
        .select("id, has_defects")
        .single();

      if (insertError || !inserted) {
        console.error("[fleet/pretrip] insert error", insertError);
        return NextResponse.json(
          { error: "Failed to save pre-trip report." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        id: inserted.id,
        hasDefects: inserted.has_defects ?? hasDefects,
      });
    } catch (err) {
      console.error("[fleet/pretrip] create error", err);
      return NextResponse.json(
        { error: "Failed to save pre-trip report." },
        { status: 500 },
      );
    }
  }

  // Listing mode (shop dashboard)
  const body = raw as ListPretripBody;

  try {
    const shopId = await resolveShopIdForListing(
      supabase,
      body.shopId ?? null,
    );

    if (!shopId) {
      return NextResponse.json(
        { error: "Unable to resolve shop for pre-trip reports." },
        { status: 400 },
      );
    }

    const { data: rows, error } = await supabase
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
        vehicles!inner (
          unit_number,
          license_plate,
          vin
        )
      `,
      )
      .eq("shop_id", shopId)
      .order("inspection_date", { ascending: false })
      .limit(250);

    if (error) {
      console.error("[fleet/pretrip] list error", error);
      return NextResponse.json(
        { error: "Failed to load pre-trip reports." },
        { status: 500 },
      );
    }

    const reports: PretripReport[] = (rows ?? []).map((row) => {
      const vehicle = (row as any).vehicles as {
        unit_number: string | null;
        license_plate: string | null;
        vin: string | null;
      } | null;

      const unitLabel =
        vehicle?.unit_number ||
        vehicle?.license_plate ||
        vehicle?.vin ||
        row.vehicle_id ||
        null;

      // Simple derived status until you add an explicit status column:
      // - with defects = "open"
      // - clear = "reviewed"
      const status = row.has_defects ? "open" : "reviewed";

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
        status,
      };
    });

    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[fleet/pretrip] list error", err);
    return NextResponse.json(
      { error: "Failed to load pre-trip reports." },
      { status: 500 },
    );
  }
}
