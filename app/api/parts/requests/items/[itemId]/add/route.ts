import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type ItemUpdate = DB["public"]["Tables"]["part_request_items"]["Update"] & {
  requested_part_number?: string | null;
  requested_manufacturer?: string | null;
};
type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"] & {
  requested_part_number?: string | null;
  requested_manufacturer?: string | null;
};

type Body = {
  partId?: string | null;
  description?: string | null;
  qty?: number | string | null;
  quotedPrice?: number | string | null;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  workOrderLineId?: string | null;
  poId?: string | null;
  locationId?: string | null;
  createAllocation?: boolean;
  warningAccepted?: boolean;
  warningReason?: string | null;
};

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value.trim());
}

function nullableUuid(value: unknown, label: string): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (!isUuid(cleaned)) throw new Error(`${label} must be a valid UUID.`);
  return cleaned;
}

function finiteNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const { itemId: rawItemId } = await ctx.params;
  const itemId = cleanString(rawItemId);
  if (!itemId || !isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid itemId." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const shopId = access.profile.shop_id;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  let partId: string | null;
  let workOrderLineId: string | null;
  let poId: string | null;
  let locationId: string | null;
  let qty: number;
  let quotedPrice: number;
  try {
    partId = nullableUuid(body.partId, "partId");
    workOrderLineId = nullableUuid(body.workOrderLineId, "workOrderLineId");
    poId = nullableUuid(body.poId, "poId");
    locationId = nullableUuid(body.locationId, "locationId");
    qty = finiteNumber(body.qty, "qty");
    quotedPrice = finiteNumber(body.quotedPrice, "quotedPrice");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (qty <= 0) {
    return NextResponse.json({ ok: false, error: "Quantity must be greater than 0." }, { status: 400 });
  }
  if (quotedPrice < 0) {
    return NextResponse.json({ ok: false, error: "Quoted price must be 0 or greater." }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabase
    .from("part_request_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle<ItemRow>();

  if (itemError) return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: false, error: "Request item not found or blocked by shop access." }, { status: 404 });

  const { data: partRequest, error: requestError } = await supabase
    .from("part_requests")
    .select("id, shop_id, work_order_id, status")
    .eq("id", item.request_id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (requestError) return NextResponse.json({ ok: false, error: requestError.message }, { status: 500 });
  if (!partRequest) return NextResponse.json({ ok: false, error: "Parent parts request is not available for this shop." }, { status: 403 });

  if (partRequest.work_order_id) {
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", partRequest.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (workOrderError) return NextResponse.json({ ok: false, error: workOrderError.message }, { status: 500 });
    if (!workOrder) return NextResponse.json({ ok: false, error: "Related work order is not available for this shop." }, { status: 403 });
  }

  if (partId) {
    const { data: part, error: partError } = await supabase
      .from("parts")
      .select("id")
      .eq("id", partId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (partError) return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
    if (!part) return NextResponse.json({ ok: false, error: "Selected part is not available for this shop." }, { status: 403 });
  }

  if (workOrderLineId) {
    const { data: line, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, work_orders!inner(id, shop_id)")
      .eq("id", workOrderLineId)
      .eq("work_orders.shop_id", shopId)
      .maybeSingle();
    if (lineError) return NextResponse.json({ ok: false, error: lineError.message }, { status: 500 });
    if (!line) return NextResponse.json({ ok: false, error: "Work order line is not available for this shop." }, { status: 403 });
    if (partRequest.work_order_id && line.work_order_id !== partRequest.work_order_id) {
      return NextResponse.json({ ok: false, error: "Work order line does not belong to this parts request work order." }, { status: 403 });
    }
  }

  if (poId) {
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("id", poId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (poError) return NextResponse.json({ ok: false, error: poError.message }, { status: 500 });
    if (!po) return NextResponse.json({ ok: false, error: "Purchase order is not available for this shop." }, { status: 403 });
  }

  const warningAccepted = body.warningAccepted === true;
  const warningReason = cleanString(body.warningReason);

  const update: ItemUpdate = {
    part_id: partId,
    description: cleanString(body.description) ?? item.description ?? "Part",
    qty,
    qty_requested: qty,
    quoted_price: quotedPrice,
    unit_price: quotedPrice,
    requested_part_number: cleanString(body.requestedPartNumber),
    requested_manufacturer: cleanString(body.requestedManufacturer),
    work_order_line_id: workOrderLineId,
    po_id: poId,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedItem, error: updateError } = await supabase
    .from("part_request_items")
    .update(update as DB["public"]["Tables"]["part_request_items"]["Update"])
    .eq("id", itemId)
    .eq("request_id", item.request_id)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle<ItemRow>();

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  if (!updatedItem) {
    return NextResponse.json({ ok: false, error: "Update did not apply. The item may have changed or your shop access was blocked." }, { status: 409 });
  }

  let allocation: { ok: true; result?: unknown } | { ok: false; error: string } | null = null;
  if (body.createAllocation && locationId) {
    const { data: allocationResult, error: allocationError } = await supabase.rpc("upsert_part_allocation_from_request_item", {
      p_request_item_id: itemId,
      p_location_id: locationId,
      p_create_stock_move: true,
    });
    allocation = allocationError ? { ok: false, error: allocationError.message } : { ok: true, result: allocationResult };
    if (allocationError) {
      return NextResponse.json({ ok: false, item: updatedItem, allocation, error: allocationError.message }, { status: 500 });
    }
  }

  if (warningAccepted && warningReason) {
    await supabase
      .from("work_order_parts")
      .update({
        mismatch_acknowledged_at: new Date().toISOString(),
        mismatch_acknowledged_by: access.profile.id,
        mismatch_warning_reason: warningReason,
      } as never)
      .eq("source_parts_request_item_id", itemId)
      .eq("shop_id", shopId);
  }

  return NextResponse.json({ ok: true, item: updatedItem, allocation });
}
