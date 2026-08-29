import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invalid work order id." },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id,shop_id,status,record_type,source_fleet_service_request_id")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (workOrderError) {
    return NextResponse.json(
      { ok: false, error: workOrderError.message },
      { status: 409 },
    );
  }

  if (!workOrder) {
    return NextResponse.json(
      { ok: false, error: "Work order not found for this shop." },
      { status: 404 },
    );
  }

  if (workOrder.record_type === "estimate") {
    return NextResponse.json(
      {
        ok: false,
        error: "Estimates cannot be archived through the work-order action.",
      },
      { status: 409 },
    );
  }

  const currentStatus = String(workOrder.status ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (currentStatus === "cancelled" || currentStatus === "canceled") {
    return NextResponse.json({
      ok: true,
      idempotent: true,
      workOrderId: id,
      archived: true,
    });
  }

  if (currentStatus === "invoiced") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invoiced work orders are already retained in financial and customer history and cannot be archived as cancelled.",
      },
      { status: 409 },
    );
  }

  if (workOrder.source_fleet_service_request_id) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This work order is linked to a Fleet service request. Close or cancel it from the Fleet workflow so the fleet request stays in sync.",
      },
      { status: 409 },
    );
  }

  const { data: activeLabor, error: activeLaborError } = await access.supabase
    .from("work_order_line_labor_segments")
    .select("id")
    .eq("work_order_id", id)
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (activeLaborError) {
    return NextResponse.json(
      { ok: false, error: activeLaborError.message },
      { status: 409 },
    );
  }

  if (activeLabor) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A technician is still clocked into this work order. End active labor before archiving it.",
      },
      { status: 409 },
    );
  }

  const archivedAt = new Date().toISOString();
  const { data: archived, error: archiveError } = await access.supabase
    .from("work_orders")
    .update({ status: "cancelled", updated_at: archivedAt })
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .eq("status", workOrder.status)
    .select("id,status,customer_id")
    .maybeSingle();

  if (archiveError) {
    const message = archiveError.message.includes("WORK_ORDER_FINANCIALLY_LOCKED")
      ? "This work order is financially locked. Keep it in invoice/customer history or use the audited correction flow instead of archiving it."
      : archiveError.message;
    return NextResponse.json(
      { ok: false, error: message },
      { status: 409 },
    );
  }

  if (!archived) {
    return NextResponse.json(
      {
        ok: false,
        error: "The work order changed while it was being archived. Refresh and try again.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    idempotent: false,
    workOrderId: archived.id,
    customerId: archived.customer_id,
    archived: true,
  });
}
