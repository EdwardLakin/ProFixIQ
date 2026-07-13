import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type ItemUpdate = Pick<
  DB["public"]["Tables"]["part_request_items"]["Update"],
  "description" | "requested_part_number" | "requested_manufacturer" | "qty" | "quoted_price" | "updated_at"
>;

type Body = {
  description?: string | null;
  requested_part_number?: string | null;
  requested_manufacturer?: string | null;
  qty?: number | string | null;
  quoted_price?: number | string | null;
};

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function numberOrNull(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

export async function PATCH(
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

  const { data: item, error: itemError } = await supabase
    .from("part_request_items")
    .select("id, request_id, shop_id, work_order_id, work_order_line_id")
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (itemError) return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: false, error: "Request item not found or blocked by shop access." }, { status: 404 });

  const { data: parentRequest, error: requestError } = await supabase
    .from("part_requests")
    .select("id, shop_id, work_order_id, quote_line_id")
    .eq("id", item.request_id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (requestError) return NextResponse.json({ ok: false, error: requestError.message }, { status: 500 });
  if (!parentRequest) return NextResponse.json({ ok: false, error: "Parent parts request is not available for this shop." }, { status: 403 });
  if (cleanString(parentRequest.work_order_id) !== cleanString(item.work_order_id)) {
    return NextResponse.json({ ok: false, error: "Request item work order context mismatch." }, { status: 403 });
  }

  if (parentRequest.work_order_id) {
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", parentRequest.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (workOrderError) return NextResponse.json({ ok: false, error: workOrderError.message }, { status: 500 });
    if (!workOrder) return NextResponse.json({ ok: false, error: "Related work order is not available for this shop." }, { status: 403 });
  }

  const update: ItemUpdate = { updated_at: new Date().toISOString() };
  if ("description" in body) update.description = cleanString(body.description) ?? "";
  if ("requested_part_number" in body) update.requested_part_number = cleanString(body.requested_part_number);
  if ("requested_manufacturer" in body) update.requested_manufacturer = cleanString(body.requested_manufacturer);

  try {
    if ("qty" in body) {
      const qty = numberOrNull(body.qty, "qty");
      if (qty == null || qty <= 0) return NextResponse.json({ ok: false, error: "qty must be greater than zero." }, { status: 400 });
      update.qty = Math.max(1, Math.floor(qty));
    }
    if ("quoted_price" in body) {
      const quotedPrice = numberOrNull(body.quoted_price, "quoted_price");
      if (quotedPrice != null && quotedPrice < 0) return NextResponse.json({ ok: false, error: "quoted_price must be zero or greater." }, { status: 400 });
      update.quoted_price = quotedPrice;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid numeric field." }, { status: 400 });
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from("part_request_items")
    .update(update)
    .eq("id", itemId)
    .eq("request_id", item.request_id)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle();

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  if (!updatedItem) return NextResponse.json({ ok: false, error: "Update did not apply." }, { status: 409 });

  return NextResponse.json({ ok: true, item: updatedItem });
}
