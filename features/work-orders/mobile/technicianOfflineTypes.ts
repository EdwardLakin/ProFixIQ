import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type TechnicianOfflineWorkOrder = {
  workOrder: DB["public"]["Tables"]["work_orders"]["Row"];
  lines: DB["public"]["Tables"]["work_order_lines"]["Row"][];
  quoteLines: DB["public"]["Tables"]["work_order_quote_lines"]["Row"][];
  vehicle: DB["public"]["Tables"]["vehicles"]["Row"] | null;
  customer: DB["public"]["Tables"]["customers"]["Row"] | null;
  techNamesById: Record<string, string>;
  assignedLineIds: string[];
};

export type TechnicianOfflineBundle = {
  scope: { userId: string; shopId: string };
  downloadedAt: string;
  workOrders: TechnicianOfflineWorkOrder[];
};
