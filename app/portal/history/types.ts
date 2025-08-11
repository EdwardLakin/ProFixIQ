import type { Database } from "@shared/types/types/supabase";

export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type WorkOrder = Database["public"]["Tables"]["work_orders"]["Row"];
export type HistoryRow = Database["public"]["Tables"]["history"]["Row"];

/**
 * Small shapes the UI needs. These keep us compatible even if your
 * work_orders table doesn’t actually have `status` or `type` right now.
 * If they do exist, it still matches at runtime; we’re just not tying the
 * property types directly to the table to avoid Pick<> mismatches.
 */
type VehicleMini = {
  id: Vehicle["id"];
  year: Vehicle["year"];
  make: Vehicle["make"];
  model: Vehicle["model"];
  vin: Vehicle extends { vin: infer V } ? V | null : string | null;
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