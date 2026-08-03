import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLineTechnician =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

type CustomerSummary = Pick<
  Customer,
  "first_name" | "last_name" | "name" | "business_name"
>;

type PriorWorkOrder = Pick<
  WorkOrder,
  | "id"
  | "custom_id"
  | "created_at"
  | "updated_at"
  | "scheduled_at"
  | "status"
  | "notes"
  | "odometer_km"
> & {
  customers?: CustomerSummary | null;
};

type PriorWorkOrderLine = Pick<
  WorkOrderLine,
  | "id"
  | "work_order_id"
  | "line_no"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "notes"
  | "status"
  | "line_status"
  | "punched_out_at"
  | "updated_at"
>;

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function workOrderIdFromUrl(url: string): string | null {
  return new URL(url).pathname.split("/").filter(Boolean)[2] ?? null;
}

function customerName(
  customer: CustomerSummary | null | undefined,
): string | null {
  if (!customer) return null;

  const fullName = [customer.first_name, customer.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return (
    customer.business_name?.trim() || customer.name?.trim() || fullName || null
  );
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ALLOWED_ROLES,
  });
  if (!access.ok) return access.response;

  const workOrderId = workOrderIdFromUrl(request.url);
  if (!workOrderId || !UUID_PATTERN.test(workOrderId)) {
    return NextResponse.json(
      { error: "Invalid work order id" },
      { status: 400 },
    );
  }

  const shopId = access.profile.shop_id;
  const admin = createAdminSupabase();
  const { data: currentWorkOrder, error: currentError } = await admin
    .from("work_orders")
    .select("id,shop_id,vehicle_id")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle<Pick<WorkOrder, "id" | "shop_id" | "vehicle_id">>();

  if (currentError) {
    return NextResponse.json(
      { error: "Could not verify the current work order." },
      { status: 500 },
    );
  }

  if (!currentWorkOrder) {
    return NextResponse.json(
      { error: "Work order not found" },
      { status: 404 },
    );
  }

  if (access.canonicalRole === "mechanic") {
    const lineId = new URL(request.url).searchParams.get("lineId")?.trim();
    if (!lineId || !UUID_PATTERN.test(lineId)) {
      return NextResponse.json(
        { error: "Invalid work order line id" },
        { status: 400 },
      );
    }

    const { data: currentLine, error: currentLineError } = await admin
      .from("work_order_lines")
      .select("id,work_order_id,assigned_tech_id,assigned_to")
      .eq("id", lineId)
      .eq("work_order_id", currentWorkOrder.id)
      .eq("shop_id", shopId)
      .maybeSingle<
        Pick<
          WorkOrderLine,
          "id" | "work_order_id" | "assigned_tech_id" | "assigned_to"
        >
      >();

    if (currentLineError) {
      return NextResponse.json(
        { error: "Could not verify the current work order line." },
        { status: 500 },
      );
    }

    if (!currentLine) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const directlyAssigned =
      currentLine.assigned_tech_id === access.profile.id ||
      currentLine.assigned_to === access.profile.id;

    if (!directlyAssigned) {
      const { data: assignment, error: assignmentError } = await admin
        .from("work_order_line_technicians")
        .select("id")
        .eq("work_order_line_id", currentLine.id)
        .eq("technician_id", access.profile.id)
        .maybeSingle<Pick<WorkOrderLineTechnician, "id">>();

      if (assignmentError) {
        return NextResponse.json(
          { error: "Could not verify technician assignment." },
          { status: 500 },
        );
      }

      if (!assignment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  if (!currentWorkOrder.vehicle_id) {
    return NextResponse.json({ ok: true, history: [] });
  }

  // Authentication, allowed staff roles, current-shop ownership, and mechanic
  // line assignment are verified above. Every privileged read below remains
  // explicitly limited to that verified shop + vehicle so technicians can see
  // prior repairs performed by other technicians without weakening RLS.
  const { data: priorRows, error: priorError } = await admin
    .from("work_orders")
    .select(
      "id,custom_id,created_at,updated_at,scheduled_at,status,notes,odometer_km,customers:customer_id(first_name,last_name,name,business_name)",
    )
    .eq("shop_id", shopId)
    .eq("vehicle_id", currentWorkOrder.vehicle_id)
    .neq("id", currentWorkOrder.id)
    .in("status", ["completed", "ready_to_invoice", "invoiced"])
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (priorError) {
    return NextResponse.json(
      { error: "Could not load prior work orders." },
      { status: 500 },
    );
  }

  const priorWorkOrders = (priorRows ?? []) as unknown as PriorWorkOrder[];
  if (priorWorkOrders.length === 0) {
    return NextResponse.json({ ok: true, history: [] });
  }

  const priorIds = priorWorkOrders.map((row) => row.id);
  const { data: lineRows, error: lineError } = await admin
    .from("work_order_lines")
    .select(
      "id,work_order_id,line_no,description,complaint,cause,correction,notes,status,line_status,punched_out_at,updated_at",
    )
    .eq("shop_id", shopId)
    .in("work_order_id", priorIds)
    .is("voided_at", null)
    .or(
      "status.in.(completed,ready_to_invoice,invoiced),line_status.in.(completed,ready_to_invoice,invoiced)",
    );

  if (lineError) {
    return NextResponse.json(
      { error: "Could not load prior service lines." },
      { status: 500 },
    );
  }

  const linesByWorkOrder = new Map<string, PriorWorkOrderLine[]>();
  for (const line of (lineRows ?? []) as PriorWorkOrderLine[]) {
    const lines = linesByWorkOrder.get(line.work_order_id) ?? [];
    lines.push(line);
    linesByWorkOrder.set(line.work_order_id, lines);
  }

  const history = priorWorkOrders.map((workOrder) => ({
    id: workOrder.id,
    workOrderNumber: workOrder.custom_id,
    status: workOrder.status,
    completedAt:
      workOrder.updated_at ?? workOrder.scheduled_at ?? workOrder.created_at,
    odometerKm: workOrder.odometer_km,
    customerName: customerName(workOrder.customers),
    notes: workOrder.notes,
    lines: (linesByWorkOrder.get(workOrder.id) ?? [])
      .sort((left, right) => {
        const leftNumber = left.line_no ?? Number.MAX_SAFE_INTEGER;
        const rightNumber = right.line_no ?? Number.MAX_SAFE_INTEGER;
        return leftNumber - rightNumber;
      })
      .map((line) => ({
        id: line.id,
        lineNumber: line.line_no,
        description: line.description,
        complaint: line.complaint,
        cause: line.cause,
        correction: line.correction,
        notes: line.notes,
        status: line.line_status ?? line.status,
        completedAt: line.punched_out_at ?? line.updated_at,
      })),
  }));

  return NextResponse.json({ ok: true, history });
}
