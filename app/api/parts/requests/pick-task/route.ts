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

function n(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "parts"],
  });
  if (!access.ok) return access.response;

  const workOrderId = new URL(req.url).searchParams.get("workOrderId");
  if (!isUuid(workOrderId)) {
    return NextResponse.json(
      { ok: false, error: "A valid workOrderId is required." },
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id, custom_id")
    .eq("id", workOrderId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (workOrderError) {
    return NextResponse.json(
      { ok: false, error: workOrderError.message },
      { status: 500 },
    );
  }
  if (!workOrder) {
    return NextResponse.json(
      { ok: false, error: "Work order not found for this shop." },
      { status: 404 },
    );
  }

  const { data: requests, error: requestError } = await access.supabase
    .from("part_requests")
    .select("id, job_id, status")
    .eq("shop_id", access.profile.shop_id)
    .eq("work_order_id", workOrderId)
    .in("status", [
      "approved",
      "partially_ordered",
      "partially_consumed",
      "partially_returned",
    ]);
  if (requestError) {
    return NextResponse.json(
      { ok: false, error: requestError.message },
      { status: 500 },
    );
  }

  const requestIds = (requests ?? []).map((request) => request.id);
  if (requestIds.length === 0) {
    return NextResponse.json({
      ok: true,
      workOrder,
      items: [],
      summary: { itemCount: 0, pickableCount: 0, orderedCount: 0 },
    });
  }

  const { data: items, error: itemError } = await access.supabase
    .from("part_request_items")
    .select(
      "id,request_id,work_order_line_id,part_id,description,requested_part_number,qty,qty_requested,qty_approved,qty_ordered,qty_received,qty_reserved,qty_consumed,qty_returned,po_id,status",
    )
    .eq("shop_id", access.profile.shop_id)
    .in("request_id", requestIds)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (itemError) {
    return NextResponse.json(
      { ok: false, error: itemError.message },
      { status: 500 },
    );
  }

  const partIds = [
    ...new Set(
      (items ?? [])
        .map((item) => item.part_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [stockResult, locationResult] = await Promise.all([
    partIds.length
      ? access.supabase
          .from("v_part_stock")
          .select("part_id,location_id,qty_available,qty_on_hand,qty_reserved")
          .in("part_id", partIds)
      : Promise.resolve({ data: [], error: null }),
    access.supabase
      .from("stock_locations")
      .select("id, code, name")
      .eq("shop_id", access.profile.shop_id),
  ]);
  if (stockResult.error) {
    return NextResponse.json(
      { ok: false, error: stockResult.error.message },
      { status: 500 },
    );
  }
  if (locationResult.error) {
    return NextResponse.json(
      { ok: false, error: locationResult.error.message },
      { status: 500 },
    );
  }

  const locations = new Map(
    (locationResult.data ?? []).map((location) => [
      location.id,
      {
        id: location.id,
        label:
          [location.code, location.name].filter(Boolean).join(" — ") ||
          "Stock location",
      },
    ]),
  );
  const stockByPart = new Map<
    string,
    Array<{
      locationId: string;
      locationLabel: string;
      available: number;
      onHand: number;
      reserved: number;
    }>
  >();
  for (const row of stockResult.data ?? []) {
    if (!row.part_id || !row.location_id) continue;
    const location = locations.get(row.location_id);
    const next = {
      locationId: row.location_id,
      locationLabel: location?.label ?? "Stock location",
      available: Math.max(0, n(row.qty_available)),
      onHand: Math.max(0, n(row.qty_on_hand)),
      reserved: Math.max(0, n(row.qty_reserved)),
    };
    stockByPart.set(row.part_id, [
      ...(stockByPart.get(row.part_id) ?? []),
      next,
    ]);
  }

  const taskItems = (items ?? []).map((item) => {
    const required = Math.max(
      n(item.qty_approved),
      n(item.qty_requested),
      n(item.qty),
      0,
    );
    const handedOff = Math.max(n(item.qty_consumed) - n(item.qty_returned), 0);
    const staged = n(item.qty_reserved) + handedOff;
    const remainingToStage = Math.max(required - staged, 0);
    const stock = (
      item.part_id ? (stockByPart.get(item.part_id) ?? []) : []
    ).sort((a, b) => b.available - a.available);
    return {
      id: item.id,
      requestId: item.request_id,
      workOrderLineId: item.work_order_line_id,
      partId: item.part_id,
      description: item.description,
      partNumber: item.requested_part_number,
      status: item.status,
      poId: item.po_id,
      required,
      ordered: n(item.qty_ordered),
      received: n(item.qty_received),
      staged,
      remainingToStage,
      stock,
    };
  });

  return NextResponse.json({
    ok: true,
    workOrder,
    items: taskItems,
    summary: {
      itemCount: taskItems.length,
      pickableCount: taskItems.filter(
        (item) =>
          item.remainingToStage > 0 &&
          item.stock.some((stock) => stock.available > 0),
      ).length,
      orderedCount: taskItems.filter((item) => item.ordered > item.received)
        .length,
    },
  });
}
