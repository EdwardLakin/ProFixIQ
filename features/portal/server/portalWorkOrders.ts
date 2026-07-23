import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  toPortalWorkOrderStatus,
  type PortalWorkOrderStatus,
} from "@/features/portal/lib/workOrderPresentation";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WorkOrderSummaryRow = Pick<
  WorkOrderRow,
  | "id"
  | "custom_id"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "advisor_id"
  | "status"
  | "approval_state"
  | "created_at"
  | "updated_at"
  | "scheduled_at"
  | "expected_completion_at"
  | "invoice_sent_at"
  | "invoice_total"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_unit_number"
  | "vehicle_license_plate"
  | "external_id"
>;

type VehicleSummaryRow = Pick<
  VehicleRow,
  "id" | "year" | "make" | "model" | "unit_number" | "license_plate"
>;

type AdvisorSummaryRow = Pick<ProfileRow, "id" | "full_name">;
type LineSummaryRow = Pick<
  WorkOrderLineRow,
  "id" | "work_order_id" | "line_no" | "description" | "complaint"
>;

export type PortalWorkOrderSummary = {
  id: string;
  reference: string;
  vehicleLabel: string;
  vehicleDetail: string | null;
  serviceSummary: string[];
  advisorName: string | null;
  status: PortalWorkOrderStatus;
  updatedAt: string | null;
  scheduledAt: string | null;
  expectedCompletionAt: string | null;
  invoiceSentAt: string | null;
  invoiceTotal: number | null;
  primaryAction: {
    href: string;
    label: string;
  };
  messageHref: string;
};

function compactText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text || null;
}

function vehiclePresentation(
  workOrder: WorkOrderSummaryRow,
  vehicle: VehicleSummaryRow | undefined,
): { label: string; detail: string | null } {
  const year = vehicle?.year ?? workOrder.vehicle_year;
  const make = compactText(vehicle?.make ?? workOrder.vehicle_make);
  const model = compactText(vehicle?.model ?? workOrder.vehicle_model);
  const label = [year, make, model].filter(Boolean).join(" ") || "Your vehicle";
  const unit = compactText(
    vehicle?.unit_number ?? workOrder.vehicle_unit_number,
  );
  const plate = compactText(
    vehicle?.license_plate ?? workOrder.vehicle_license_plate,
  );
  const detail = [unit ? `Unit ${unit}` : null, plate ? `Plate ${plate}` : null]
    .filter(Boolean)
    .join(" • ");
  return { label, detail: detail || null };
}

function primaryAction(
  workOrder: WorkOrderSummaryRow,
  status: PortalWorkOrderStatus,
): PortalWorkOrderSummary["primaryAction"] {
  if (status.key === "approval_needed") {
    return {
      href: `/portal/quotes/${workOrder.id}`,
      label: "Review estimate",
    };
  }
  if (workOrder.invoice_sent_at) {
    return {
      href: `/portal/invoices/${workOrder.id}`,
      label: "View invoice",
    };
  }
  return {
    href: `/portal/work-orders/view/${workOrder.id}`,
    label: "View service",
  };
}

export async function listPortalWorkOrdersForCustomer({
  supabase,
  customerId,
  shopId,
  limit = 50,
}: {
  supabase: SupabaseClient<DB>;
  customerId: string;
  shopId: string;
  limit?: number;
}): Promise<PortalWorkOrderSummary[]> {
  const { data: workOrders, error: workOrderError } = await supabase
    .from("work_orders")
    .select(
      "id,custom_id,shop_id,customer_id,vehicle_id,advisor_id,status,approval_state,created_at,updated_at,scheduled_at,expected_completion_at,invoice_sent_at,invoice_total,vehicle_year,vehicle_make,vehicle_model,vehicle_unit_number,vehicle_license_plate,external_id",
    )
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<WorkOrderSummaryRow[]>();

  if (workOrderError) throw new Error(workOrderError.message);
  const rows = (workOrders ?? []).filter(
    (workOrder) =>
      !workOrder.external_id?.startsWith("portal_quote:") ||
      Boolean(workOrder.scheduled_at),
  );
  if (rows.length === 0) return [];

  const workOrderIds = rows.map((row) => row.id);
  const vehicleIds = Array.from(
    new Set(
      rows
        .map((row) => row.vehicle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const advisorIds = Array.from(
    new Set(
      rows
        .map((row) => row.advisor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [vehicleResult, advisorResult, lineResult] = await Promise.all([
    vehicleIds.length
      ? supabase
          .from("vehicles")
          .select("id,year,make,model,unit_number,license_plate")
          .eq("shop_id", shopId)
          .eq("customer_id", customerId)
          .in("id", vehicleIds)
          .returns<VehicleSummaryRow[]>()
      : Promise.resolve({ data: [] as VehicleSummaryRow[], error: null }),
    advisorIds.length
      ? supabase
          .from("profiles")
          .select("id,full_name")
          .eq("shop_id", shopId)
          .in("id", advisorIds)
          .returns<AdvisorSummaryRow[]>()
      : Promise.resolve({ data: [] as AdvisorSummaryRow[], error: null }),
    supabase
      .from("work_order_lines")
      .select("id,work_order_id,line_no,description,complaint")
      .in("work_order_id", workOrderIds)
      .order("line_no", { ascending: true })
      .returns<LineSummaryRow[]>(),
  ]);

  const queryError =
    vehicleResult.error ?? advisorResult.error ?? lineResult.error;
  if (queryError) throw new Error(queryError.message);

  const vehiclesById = new Map(
    (vehicleResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]),
  );
  const advisorsById = new Map(
    (advisorResult.data ?? []).map((advisor) => [advisor.id, advisor]),
  );
  const linesByWorkOrder = new Map<string, string[]>();

  for (const line of lineResult.data ?? []) {
    const summary =
      compactText(line.description) ?? compactText(line.complaint);
    if (!summary) continue;
    const current = linesByWorkOrder.get(line.work_order_id) ?? [];
    if (!current.includes(summary) && current.length < 3) current.push(summary);
    linesByWorkOrder.set(line.work_order_id, current);
  }

  return rows.map((workOrder) => {
    const status = toPortalWorkOrderStatus({
      status: workOrder.status,
      approvalState: workOrder.approval_state,
      scheduledAt: workOrder.scheduled_at,
      invoiceSentAt: workOrder.invoice_sent_at,
    });
    const vehicle = vehiclePresentation(
      workOrder,
      workOrder.vehicle_id ? vehiclesById.get(workOrder.vehicle_id) : undefined,
    );

    return {
      id: workOrder.id,
      reference:
        workOrder.custom_id?.trim() ||
        `#${workOrder.id.slice(0, 8).toUpperCase()}`,
      vehicleLabel: vehicle.label,
      vehicleDetail: vehicle.detail,
      serviceSummary: linesByWorkOrder.get(workOrder.id) ?? ["Service visit"],
      advisorName: workOrder.advisor_id
        ? compactText(advisorsById.get(workOrder.advisor_id)?.full_name)
        : null,
      status,
      updatedAt: workOrder.updated_at ?? workOrder.created_at,
      scheduledAt: workOrder.scheduled_at,
      expectedCompletionAt: workOrder.expected_completion_at,
      invoiceSentAt: workOrder.invoice_sent_at,
      invoiceTotal: workOrder.invoice_total,
      primaryAction: primaryAction(workOrder, status),
      messageHref: `/portal/messages?compose=1&workOrderId=${encodeURIComponent(workOrder.id)}`,
    };
  });
}
