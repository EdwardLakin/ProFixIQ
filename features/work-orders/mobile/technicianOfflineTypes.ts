import type { Database } from "@shared/types/types/supabase";
import type { CanonicalWorkOrderLineContext } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { WorkOrderFinancialAccess } from "@/features/work-orders/workspace/workOrderFinancialAccess";

type DB = Database;

export type TechnicianOfflineWorkOrder = {
  workOrder: DB["public"]["Tables"]["work_orders"]["Row"];
  lines: DB["public"]["Tables"]["work_order_lines"]["Row"][];
  quoteLines: DB["public"]["Tables"]["work_order_quote_lines"]["Row"][];
  vehicle: DB["public"]["Tables"]["vehicles"]["Row"] | null;
  customer: DB["public"]["Tables"]["customers"]["Row"] | null;
  techNamesById: Record<string, string>;
  lineContext: CanonicalWorkOrderLineContext;
  shopLaborRate: number | null;
  financialAccess: WorkOrderFinancialAccess;
  assignedLineIds: string[];
};

export type TechnicianOfflineBundle = {
  scope: { userId: string; shopId: string };
  productScope: "shop" | "field";
  downloadedAt: string;
  workOrders: TechnicianOfflineWorkOrder[];
};
