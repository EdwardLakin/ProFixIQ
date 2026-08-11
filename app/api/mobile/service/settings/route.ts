import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ConfigureRpcArgs =
  Database["public"]["Functions"]["mobile_configure_service_v1_atomic"]["Args"];

type SettingsBody = {
  serviceModel?: "shop" | "mobile" | "both";
  soloMode?: boolean;
  dispatchEnabled?: boolean;
  serviceVehiclesEnabled?: boolean;
  truckInventoryEnabled?: boolean;
  defaultVisitMinutes?: number;
  fieldOperatorCountTarget?: number;
  enableCurrentActorFieldOperator?: boolean;
  serviceVehicleName?: string | null;
  serviceVehicleUnitNumber?: string | null;
};

async function readSettings(
  access: Extract<
    Awaited<ReturnType<typeof requireShopScopedApiAccess>>,
    { ok: true }
  >,
) {
  const [settingsResult, operatorResult, vehicleResult] = await Promise.all([
    access.supabase
      .from("mobile_service_settings")
      .select(
        "shop_id,service_model,solo_mode,dispatch_enabled,service_vehicles_enabled,truck_inventory_enabled,default_visit_minutes,field_operator_count_target,onboarding_completed_at",
      )
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle(),
    access.supabase
      .from("mobile_field_operators")
      .select("enabled")
      .eq("shop_id", access.profile.shop_id)
      .eq("profile_id", access.profile.id)
      .maybeSingle(),
    access.supabase
      .from("service_vehicles")
      .select("id,name,unit_number,stock_location_id,active,capabilities")
      .eq("shop_id", access.profile.shop_id)
      .eq("primary_user_id", access.profile.id)
      .eq("active", true)
      .contains("capabilities", { mobile_v1: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError =
    settingsResult.error || operatorResult.error || vehicleResult.error;
  if (firstError) throw new Error(firstError.message);

  return {
    settings: settingsResult.data ?? null,
    currentActorFieldOperator: operatorResult.data?.enabled === true,
    serviceVehicle: vehicleResult.data ?? null,
    canConfigure: ["owner", "admin"].includes(access.canonicalRole),
  };
}

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(await readSettings(access));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Mobile Service settings.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as SettingsBody | null;
  if (!body)
    return NextResponse.json(
      { error: "Invalid settings payload." },
      { status: 400 },
    );

  const defaultVisitMinutes = Math.trunc(
    Number(body.defaultVisitMinutes ?? 60),
  );
  const fieldOperatorCountTarget = Math.trunc(
    Number(body.fieldOperatorCountTarget ?? 1),
  );
  if (defaultVisitMinutes < 5 || defaultVisitMinutes > 720) {
    return NextResponse.json(
      { error: "Default visit length must be 5–720 minutes." },
      { status: 400 },
    );
  }
  if (fieldOperatorCountTarget < 1 || fieldOperatorCountTarget > 500) {
    return NextResponse.json(
      { error: "Field operator count is invalid." },
      { status: 400 },
    );
  }

  const rpcArgs = {
    p_shop_id: access.profile.shop_id,
    p_service_model: body.serviceModel ?? "mobile",
    p_solo_mode: Boolean(body.soloMode),
    p_dispatch_enabled: body.dispatchEnabled !== false,
    p_service_vehicles_enabled: Boolean(body.serviceVehiclesEnabled),
    p_truck_inventory_enabled: Boolean(body.truckInventoryEnabled),
    p_default_visit_minutes: defaultVisitMinutes,
    p_field_operator_count_target: fieldOperatorCountTarget,
    p_enable_current_actor_field_operator: Boolean(
      body.enableCurrentActorFieldOperator,
    ),
    p_service_vehicle_name: body.serviceVehicleName?.trim() || null,
    p_service_vehicle_unit_number:
      body.serviceVehicleUnitNumber?.trim() || null,
    p_actor_user_id: access.authUserId,
  } as unknown as ConfigureRpcArgs;

  const { data, error } = await access.supabase.rpc(
    "mobile_configure_service_v1_atomic",
    rpcArgs,
  );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : 409 },
    );
  }

  try {
    return NextResponse.json({
      ok: true,
      result: data,
      ...(await readSettings(access)),
    });
  } catch {
    return NextResponse.json({ ok: true, result: data });
  }
}
