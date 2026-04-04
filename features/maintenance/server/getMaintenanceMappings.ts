import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB, MaintenanceServiceRow, ShopMaintenanceServiceMapRow } from "./types";

export type MaintenanceMappingListItem = {
  serviceCode: string;
  label: string;
  defaultJobType: string | null;
  menuItemId: string | null;
  menuItemName: string | null;
  menuRepairItemId: string | null;
  labelOverride: string | null;
  isActive: boolean;
  matchSource: string | null;
  confidence: number | null;
};

export async function getMaintenanceMappings(opts: {
  supabase: SupabaseClient<DB>;
  shopId: string;
}): Promise<MaintenanceMappingListItem[]> {
  const { supabase, shopId } = opts;

  const { data: servicesData, error: servicesError } = await supabase
    .from("maintenance_services")
    .select("code, label, default_job_type")
    .order("label", { ascending: true });

  if (servicesError) throw servicesError;

  const { data: mapsData, error: mapsError } = await supabase
    .from("shop_maintenance_service_map")
    .select(
      "service_code, menu_item_id, menu_repair_item_id, label_override, is_active, match_source, confidence"
    )
    .eq("shop_id", shopId);

  const menuItemIds = [...new Set((mapsData ?? []).map((row) => row.menu_item_id).filter(Boolean))] as string[];

  let menuNameById = new Map<string, string>();
  if (menuItemIds.length > 0) {
    const { data: menuItemsData, error: menuItemsError } = await supabase
      .from("menu_items")
      .select("id, name")
      .eq("shop_id", shopId)
      .in("id", menuItemIds);

    if (menuItemsError) throw menuItemsError;

    menuNameById = new Map(
      ((menuItemsData ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
        row.id,
        row.name ?? row.id,
      ])
    );
  }

  if (mapsError) throw mapsError;

  const services = (servicesData ?? []) as Pick<
    MaintenanceServiceRow,
    "code" | "label" | "default_job_type"
  >[];

  const maps = (mapsData ?? []) as Array<
    Pick<
      ShopMaintenanceServiceMapRow,
      | "service_code"
      | "menu_item_id"
      | "menu_repair_item_id"
      | "label_override"
      | "is_active"
      | "match_source"
      | "confidence"
    >
  >;

  const mapByCode = new Map(maps.map((row) => [row.service_code, row]));

  return services.map((service) => {
    const mapped = mapByCode.get(service.code);

    return {
      serviceCode: service.code,
      label: service.label,
      defaultJobType: service.default_job_type ?? null,
      menuItemId: mapped?.menu_item_id ?? null,
      menuItemName: mapped?.menu_item_id ? menuNameById.get(mapped.menu_item_id) ?? null : null,
      menuRepairItemId: mapped?.menu_repair_item_id ?? null,
      labelOverride: mapped?.label_override ?? null,
      isActive: mapped?.is_active ?? true,
      matchSource: mapped?.match_source ?? null,
      confidence: mapped?.confidence ?? null,
    };
  });
}
