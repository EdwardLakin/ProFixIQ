import type { Database } from "@shared/types/types/supabase";

export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type WorkOrder = Database["public"]["Tables"]["work_orders"]["Row"];
export type HistoryRow = Database["public"]["Tables"]["history"]["Row"];

/**
 * Small shapes the UI needs.
 * `work_orders.status` and `work_orders.type` exist in generated DB types,
 * but these remain optional for defensive UI compatibility.
 */
type VehicleMini = {
  id: Vehicle["id"];
  year: Vehicle["year"];
  make: Vehicle["make"];
  model: Vehicle["model"];
  vin: Vehicle extends { vin: infer V } ? V | null : string | null;
  license_plate: Vehicle extends { license_plate: infer P }
    ? P | null
    : string | null;
};

type WorkOrderMini = {
  id: WorkOrder["id"];
  // optional so UI can render even if your table lacks these columns
  status?: string | null;
  type?: string | null;
};

/** Joined shape returned by our select in page.tsx */
export type HistoryItem = Omit<HistoryRow, "vehicle_id" | "work_order_id"> & {
  vehicle: VehicleMini | null;
  work_order: WorkOrderMini | null;
};