import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import {
  collectTechnicianIdsForLineContexts,
  loadCanonicalWorkOrderLineContext,
  loadRowsForIdChunks,
} from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import {
  projectRoleShapedWorkOrderDetail,
  type RoleShapedWorkOrderDetail,
  type WorkOrderInvoiceReviewSummary,
} from "@/features/work-orders/workspace/workOrderFinancialProjection";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import { loadAuthorizedWorkOrderWorkspaceSnapshot } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

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
  throwQueryError(result.error, `Unable to load workspace ${input.table}`);
  return (result.data as T | null) ?? null;
}

/**
 * Authorizes identity with the request-bound session client, reads complete
 * records only with the trusted data client, and redacts every financial field
 * before returning a browser/offline-safe payload.
 */
export async function loadRoleShapedWorkOrderDetail(input: {
  authorizationSupabase: SupabaseClient<DB>;
  dataSupabase: SupabaseClient<DB>;
  profileId: string;
  shopId: string;
  routeId: string;
}): Promise<RoleShapedWorkOrderDetail | null> {
  const workspace = await loadAuthorizedWorkOrderWorkspaceSnapshot({
    dataSupabase: input.dataSupabase,
    profileId: input.profileId,
    shopId: input.shopId,
    routeId: input.routeId,
  });
  if (!workspace) return null;

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: input.authorizationSupabase,
    profileId: input.profileId,
    shopId: input.shopId,
  });
  if (financial.error) {
    throw new Error(
      `Work-order financial authorization could not be resolved: ${financial.error}`,
    );
  }

  const workOrderId = workspace.workOrder.id;
  const workOrderResult = await input.dataSupabase
    .from("work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("shop_id", input.shopId)
    .maybeSingle();
  throwQueryError(workOrderResult.error, "Unable to load work order");
  const workOrder = (workOrderResult.data as WorkOrder | null) ?? null;
  if (!workOrder || workOrder.shop_id !== input.shopId) return null;

  const [lines, quoteLines, vehicle, customer, shopResult, reviewResult] =
    await Promise.all([
      loadRowsForIdChunks<WorkOrderLine>([workOrderId], (ids, from, to) =>
        input.dataSupabase
          .from("work_order_lines")
          .select("*")
          .eq("shop_id", input.shopId)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRowsForIdChunks<QuoteLine>([workOrderId], (ids, from, to) =>
        input.dataSupabase
          .from("work_order_quote_lines")
          .select("*")
          .eq("shop_id", input.shopId)
          .in("work_order_id", ids)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      loadRelatedRecord<Vehicle>({
        supabase: input.dataSupabase,
        table: "vehicles",
        id: workOrder.vehicle_id,
        shopId: input.shopId,
      }),
      loadRelatedRecord<Customer>({
        supabase: input.dataSupabase,
        table: "customers",
        id: workOrder.customer_id,
        shopId: input.shopId,
      }),
      input.dataSupabase
        .from("shops")
        .select("labor_rate")
        .eq("id", input.shopId)
        .maybeSingle<{ labor_rate: number | null }>(),
      financial.access.canViewInvoice
        ? input.dataSupabase
            .from("work_order_invoice_reviews")
            .select("ok, issues, created_at")
            .eq("shop_id", input.shopId)
            .eq("work_order_id", workOrderId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<WorkOrderInvoiceReviewSummary>()
        : Promise.resolve({ data: null, error: null }),
    ]);

  throwQueryError(shopResult.error, "Unable to load shop labor rate");
  throwQueryError(reviewResult.error, "Unable to load invoice review");

  const lineContext = await loadCanonicalWorkOrderLineContext({
    supabase: input.dataSupabase,
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
    input.dataSupabase
      .from("profiles")
      .select("id, full_name")
      .eq("shop_id", input.shopId)
      .in("id", ids)
      .order("id", { ascending: true })
      .range(from, to),
  );

  return projectRoleShapedWorkOrderDetail({
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
    financialAccess: financial.access,
    latestInvoiceReview:
      (reviewResult.data as WorkOrderInvoiceReviewSummary | null) ?? null,
  });
}
