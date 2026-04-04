import type { Database } from "@shared/types/types/supabase";

export type DB = Database;

export type MaintenanceServiceRow =
  DB["public"]["Tables"]["maintenance_services"]["Row"];

export type MaintenanceRuleRow =
  DB["public"]["Tables"]["maintenance_rules"]["Row"];

export type MaintenanceSuggestionRecordRow =
  DB["public"]["Tables"]["maintenance_suggestions"]["Row"];

export type WorkOrderRow =
  Pick<
    DB["public"]["Tables"]["work_orders"]["Row"],
    "id" | "shop_id" | "vehicle_id" | "odometer_km" | "created_at"
  >;

export type VehicleRow =
  Pick<
    DB["public"]["Tables"]["vehicles"]["Row"],
    "id" | "year" | "make" | "model" | "mileage" | "engine_family"
  >;

export type WorkOrderHistoryRow =
  Pick<
    DB["public"]["Tables"]["work_order_lines"]["Row"],
    | "id"
    | "vehicle_id"
    | "work_order_id"
    | "service_code"
    | "menu_item_id"
    | "description"
    | "odometer_km"
    | "created_at"
    | "line_status"
    | "status"
  >;

export type ShopMaintenanceServiceMapRow = {
  id: string;
  shop_id: string;
  service_code: string;
  menu_item_id: string | null;
  menu_repair_item_id: string | null;
  label_override: string | null;
  is_active: boolean;
  match_source: string;
  confidence: number | null;
  created_at: string;
  updated_at: string;
};

export type ShopVehicleMenuItemRow =
  DB["public"]["Tables"]["shop_vehicle_menu_items"]["Row"];

export type VehicleMenuRow =
  DB["public"]["Tables"]["vehicle_menus"]["Row"];

export type MaintenanceHistoryMatchSource =
  | "service_code"
  | "shop_map_menu_item"
  | "vehicle_menu_item"
  | "text_fallback";

export type MaintenanceAddPath = "menu_item" | "generic";

export type MaintenanceAdvisorBucket = "urgent" | "due_soon" | "bundle";

export type MaintenanceSuggestionItem = {
  serviceCode: string;
  label: string;
  jobType: string;
  laborHours: number | null;
  notes: string | null;
  isCritical: boolean;
  dueNow: boolean;
  overdue: boolean;
  currentMileageKm: number | null;
  currentAgeMonths: number | null;
  triggerMileageKm: number | null;
  triggerAgeMonths: number | null;
  lastCompletedAt: string | null;
  lastCompletedMileageKm: number | null;
  historyMatchSource: MaintenanceHistoryMatchSource | null;
  menuItemId: string | null;
  menuItemName: string | null;
  menuRepairItemId: string | null;
  addPath: MaintenanceAddPath;
  mappingSource: "shop_map" | "vehicle_menu" | "none";
  suppressed: boolean;
  suppressedReason: string | null;
  advisorPriority: number;
  advisorBucket: MaintenanceAdvisorBucket;
  revenueScore: number;
  bundleKey: string | null;
  whyDue: string | null;
  sellOrder: number;
  estimatedPackagePrice: number | null;
  menuItemPrice: number | null;
  effectivePrice: number | null;
};
