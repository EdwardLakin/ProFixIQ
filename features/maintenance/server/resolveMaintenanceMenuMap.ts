import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DB,
  ShopMaintenanceServiceMapRow,
  ShopVehicleMenuItemRow,
  VehicleMenuRow,
} from "./types";

export type ResolvedMaintenanceMenuMap = {
  serviceCode: string;
  menuItemId: string | null;
  menuRepairItemId: string | null;
  mappingSource: "shop_map" | "vehicle_menu" | "none";
};

type ResolveOpts = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  serviceCode: string;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    engineFamily: string | null;
  };
};

function normalizeText(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase() ?? "";
  return next.length ? next : null;
}

function yearMatches(
  vehicleYear: number | null,
  row: Pick<VehicleMenuRow, "year_from" | "year_to">,
): boolean {
  if (vehicleYear == null) return true;
  return vehicleYear >= row.year_from && vehicleYear <= row.year_to;
}

function matchesVehicleMenu(
  vehicle: ResolveOpts["vehicle"],
  row: VehicleMenuRow,
): boolean {
  const makeOk =
    normalizeText(vehicle.make) == null ||
    normalizeText(row.make) == null ||
    normalizeText(vehicle.make) === normalizeText(row.make);

  const modelOk =
    normalizeText(vehicle.model) == null ||
    normalizeText(row.model) == null ||
    normalizeText(vehicle.model) === normalizeText(row.model);

  const engineOk =
    normalizeText(row.engine_family) == null ||
    normalizeText(vehicle.engineFamily) == null ||
    normalizeText(row.engine_family) === normalizeText(vehicle.engineFamily);

  return makeOk && modelOk && engineOk && yearMatches(vehicle.year, row);
}

export async function resolveMaintenanceMenuMap(
  opts: ResolveOpts,
): Promise<ResolvedMaintenanceMenuMap> {
  const { supabase, shopId, serviceCode, vehicle } = opts;

  const { data: explicitMap, error: explicitMapError } = await supabase
    .from("shop_maintenance_service_map")
    .select("service_code, menu_item_id, menu_repair_item_id, is_active")
    .eq("shop_id", shopId)
    .eq("service_code", serviceCode)
    .eq("is_active", true)
    .maybeSingle();

  if (explicitMapError) {
    throw explicitMapError;
  }

  const mapped = explicitMap as ShopMaintenanceServiceMapRow | null;
  if (mapped) {
    return {
      serviceCode,
      menuItemId: mapped.menu_item_id ?? null,
      menuRepairItemId: mapped.menu_repair_item_id ?? null,
      mappingSource: "shop_map",
    };
  }

  const { data: vehicleMenusData, error: vehicleMenusError } = await supabase
    .from("vehicle_menus")
    .select(
      "id, service_code, make, model, year_from, year_to, engine_family, default_labor_hours, default_parts, created_at, updated_at",
    )
    .eq("service_code", serviceCode);

  if (vehicleMenusError) {
    throw vehicleMenusError;
  }

  const vehicleMenus = (vehicleMenusData ?? []) as VehicleMenuRow[];
  const matchedVehicleMenu = vehicleMenus.find((row) =>
    matchesVehicleMenu(vehicle, row),
  );

  if (!matchedVehicleMenu) {
    return {
      serviceCode,
      menuItemId: null,
      menuRepairItemId: null,
      mappingSource: "none",
    };
  }

  const { data: shopVehicleMenuItemsData, error: shopVehicleMenuItemsError } =
    await supabase
      .from("shop_vehicle_menu_items")
      .select("id, shop_id, vehicle_menu_id, menu_item_id, created_at")
      .eq("shop_id", shopId)
      .eq("vehicle_menu_id", matchedVehicleMenu.id)
      .limit(1)
      .maybeSingle();

  if (shopVehicleMenuItemsError) {
    throw shopVehicleMenuItemsError;
  }

  const fallback = shopVehicleMenuItemsData as ShopVehicleMenuItemRow | null;

  return {
    serviceCode,
    menuItemId: fallback?.menu_item_id ?? null,
    menuRepairItemId: null,
    mappingSource: fallback?.menu_item_id ? "vehicle_menu" : "none",
  };
}
