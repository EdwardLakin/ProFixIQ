import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  collectTechnicianIdsForLineContexts,
  loadCanonicalWorkOrderLineContext,
  loadRowsForIdChunks,
} from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { MobileWorkOrderSnapshot } from "@/features/work-orders/mobile/mobileWorkOrderDetail";
import {
  loadWorkOrderWorkspaceSnapshot,
  WORK_ORDER_WORKSPACE_READER_ROLES,
} from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

export const MOBILE_WORK_ORDER_DETAIL_ROLES =
  WORK_ORDER_WORKSPACE_READER_ROLES;

function throwQueryError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

async function loadRelatedRecord<T>(input: {
  supabase: SupabaseClient<DB>;
  table: "vehicles" | "customers";
  id: string | null;
  shopId: string;
}): Promise<T | null> {
  if (!input.id) return null;
  const result = await input.supabase
    .from(input.table)
    .select("*")
    .eq("id", input.id)
    .eq("shop_id", input.shopId)
    .maybeSingle();
  throwQueryError(result.error, `Unable to load mobile ${input.table}`);
  return (result.data as T | null) ?? null;
}

/**
 * Builds the mobile snapshot from the same tenant-scoped work-order identity
 * and canonical line-context readers used by the Shop workspace.
 */
export async function loadMobileWorkOrderDetail(input: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  routeId: string;
}): Promise<MobileWorkOrderSnapshot | null> {
  const workspace = await loadWorkOrderWorkspaceSnapshot(input);
  if (!workspace) return null;

  const workOrderId = workspace.workOrder.id;
  const workOrderResult = await input.supabase
    .from("work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle();
  throwQueryError(workOrderResult.error, "Unable to load mobile work order");
  const workOrder = (workOrderResult.data as WorkOrder | null) ?? null;
  if (!workOrder || workOrder.shop_id !== input.shopId) return null;

  const [lines, quoteLines, vehicle, customer, shopResult] =
    await Promise.all([
      loadRowsForIdChunks<WorkOrderLine>([workOrderId], (ids, from, to) =>
        input.supabase
          .from("work_order_lines")
          .select("*")
          .eq("shop_id", input.shopId)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRowsForIdChunks<QuoteLine>([workOrderId], (ids, from, to) =>
        input.supabase
          .from("work_order_quote_lines")
          .select("*")
          .eq("shop_id", input.shopId)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRelatedRecord<Vehicle>({
        supabase: input.supabase,
        table: "vehicles",
        id: workOrder.vehicle_id,
        shopId: input.shopId,
      }),
      loadRelatedRecord<Customer>({
        supabase: input.supabase,
        table: "customers",
        id: workOrder.customer_id,
        shopId: input.shopId,
      }),
      input.supabase
        .from("shops")
        .select("labor_rate")
        .eq("id", input.shopId)
        .maybeSingle<{ labor_rate: number | null }>(),
    ]);

  throwQueryError(shopResult.error, "Unable to load mobile shop labor rate");

  const lineContext = await loadCanonicalWorkOrderLineContext({
    supabase: input.supabase,
    workOrderId,
    shopId: input.shopId,
    lineIds: lines.map((line) => line.id),
  });
  const technicianIds = collectTechnicianIdsForLineContexts(
    [lineContext],
    lines.map((line) => line.assigned_tech_id),
  );
  const technicians = await loadRowsForIdChunks<{
    id: string;
    full_name: string | null;
  }>(technicianIds, (ids, from, to) =>
    input.supabase
      .from("profiles")
      .select("id, full_name")
      .eq("shop_id", input.shopId)
      .in("id", ids)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return {
    workOrder,
    lines,
    quoteLines,
    vehicle,
    customer,
    techNamesById: Object.fromEntries(
      technicians.map((technician) => [
        technician.id,
        technician.full_name ?? "Technician",
      ]),
    ),
    lineContext,
    shopLaborRate:
      typeof shopResult.data?.labor_rate === "number"
        ? shopResult.data.labor_rate
        : null,
  };
}
