import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";
import { isPartsRequestItemPriced } from "@/features/parts/lib/status-display";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ESTIMATE_PARTS_ROLES } from "@/features/estimates/lib/access";

type DB = Database;
type PartRequestItemUpdate =
  DB["public"]["Tables"]["part_request_items"]["Update"];

type Body = {
  quoteLineId?: string | null;
  description?: string | null;
  qty?: number | string | null;
  quotedPrice?: number | string | null;
  vendorId?: string | null;
  vendor?: string | null;
  partId?: string | null;
  requestedPartNumber?: string | null;
  requestedManufacturer?: string | null;
  notes?: string | null;
};

const BLOCKED_ITEM_STATUSES = new Set(["cancelled", "rejected", "declined"]);

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim(),
  );
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function nullableUuid(value: unknown, label: string): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;
  if (!isUuid(cleaned)) throw new Error(`${label} must be a valid UUID.`);
  return cleaned;
}

function numberOrNull(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function nonNegativeCounter(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const { itemId: rawItemId } = await ctx.params;
  const itemId = cleanString(rawItemId);

  if (!itemId || !isUuid(itemId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid itemId" },
      { status: 400 },
    );
  }

  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "parts", "lead_hand", "foreman"],
    requiredCapability: "canManageParts",
  });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const shopId = access.profile.shop_id;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: shopId,
  });
  if (contextError) {
    return NextResponse.json(
      { ok: false, error: contextError.message },
      { status: 403 },
    );
  }

  const { data: item, error: itemError } = await supabase
    .from("part_request_items")
    .select(
      "id, request_id, shop_id, work_order_id, quote_line_id, work_order_line_id, status, description, part_id, requested_part_number, requested_manufacturer, qty, qty_requested, quoted_price, unit_price, qty_received, qty_consumed, qty_reserved, qty_picked",
    )
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json(
      { ok: false, error: itemError.message },
      { status: 500 },
    );
  }
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "Request item not found" },
      { status: 404 },
    );
  }

  const itemQuoteLineId = cleanString(item.quote_line_id);
  if (!itemQuoteLineId) {
    return NextResponse.json(
      { ok: false, error: "This item is not linked to a quote line" },
      { status: 400 },
    );
  }

  let bodyQuoteLineId: string | null;
  let partId: string | null;
  let vendorId: string | null;
  let qty: number | null;
  let quotedPrice: number | null;
  try {
    bodyQuoteLineId = nullableUuid(body.quoteLineId, "quoteLineId");
    partId = nullableUuid(body.partId, "partId");
    vendorId = nullableUuid(body.vendorId, "vendorId");
    qty = numberOrNull(body.qty, "qty");
    quotedPrice = numberOrNull(body.quotedPrice, "quotedPrice");
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid body",
      },
      { status: 400 },
    );
  }

  if (bodyQuoteLineId && bodyQuoteLineId !== itemQuoteLineId) {
    return NextResponse.json(
      { ok: false, error: "Quote line mismatch" },
      { status: 403 },
    );
  }

  if (cleanString(item.work_order_line_id)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This item is already materialized to a work order line; use the normal allocation flow.",
      },
      { status: 409 },
    );
  }

  const normalizedStatus = cleanString(item.status)?.toLowerCase() ?? "";
  if (BLOCKED_ITEM_STATUSES.has(normalizedStatus)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cancelled or rejected request items cannot be quoted.",
      },
      { status: 409 },
    );
  }

  if (
    nonNegativeCounter(item.qty_received) > 0 ||
    nonNegativeCounter(item.qty_consumed) > 0 ||
    nonNegativeCounter(item.qty_reserved) > 0 ||
    nonNegativeCounter(item.qty_picked) > 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Cannot change quote-only pricing after inventory activity exists.",
      },
      { status: 409 },
    );
  }

  const { data: parentRequest, error: requestError } = await supabase
    .from("part_requests")
    .select(
      "id, shop_id, work_order_id, quote_line_id, status, source_context, source_revision",
    )
    .eq("id", item.request_id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json(
      { ok: false, error: requestError.message },
      { status: 500 },
    );
  }
  if (!parentRequest) {
    return NextResponse.json(
      { ok: false, error: "Parent request not found" },
      { status: 404 },
    );
  }
  if (
    cleanString(parentRequest.quote_line_id) &&
    cleanString(parentRequest.quote_line_id) !== itemQuoteLineId
  ) {
    return NextResponse.json(
      { ok: false, error: "Parent request quote line mismatch" },
      { status: 403 },
    );
  }
  if (
    cleanString(parentRequest.work_order_id) !== cleanString(item.work_order_id)
  ) {
    return NextResponse.json(
      { ok: false, error: "Parent request work order mismatch" },
      { status: 403 },
    );
  }

  if (parentRequest.source_context === "estimate") {
    if (!ESTIMATE_PARTS_ROLES.some((role) => role === access.canonicalRole)) {
      return NextResponse.json(
        { ok: false, error: "This role cannot price advisor estimates." },
        { status: 403 },
      );
    }
    const { data: estimate, error: estimateError } = await supabase
      .from("work_orders")
      .select("id, estimate_status, estimate_revision")
      .eq("id", parentRequest.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (estimateError) {
      return NextResponse.json(
        { ok: false, error: estimateError.message },
        { status: 500 },
      );
    }
    if (
      !estimate ||
      estimate.estimate_status !== "waiting_for_parts" ||
      estimate.estimate_revision !== parentRequest.source_revision
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Estimate pricing is locked. The advisor must return the current revision to Parts before it can be changed.",
        },
        { status: 409 },
      );
    }
  }

  const { data: quoteLine, error: quoteLineError } = await supabase
    .from("work_order_quote_lines")
    .select(
      "id, shop_id, work_order_id, work_order_line_id, approved_at, declined_at, status, stage",
    )
    .eq("id", itemQuoteLineId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (quoteLineError) {
    return NextResponse.json(
      { ok: false, error: quoteLineError.message },
      { status: 500 },
    );
  }
  if (!quoteLine) {
    return NextResponse.json(
      { ok: false, error: "Quote line not found" },
      { status: 404 },
    );
  }
  if (
    cleanString(quoteLine.work_order_id) !== cleanString(item.work_order_id)
  ) {
    return NextResponse.json(
      { ok: false, error: "Quote line work order mismatch" },
      { status: 403 },
    );
  }
  if (cleanString(quoteLine.work_order_line_id) || quoteLine.approved_at) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Quote line is already approved/materialized; use the normal allocation flow.",
      },
      { status: 409 },
    );
  }
  if (
    quoteLine.declined_at ||
    ["cancelled", "rejected", "declined"].includes(
      (cleanString(quoteLine.status) ?? "").toLowerCase(),
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "Declined or cancelled quote lines cannot be quoted.",
      },
      { status: 409 },
    );
  }

  if (partId) {
    const { data: part, error: partError } = await supabase
      .from("parts")
      .select("id")
      .eq("id", partId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (partError) {
      return NextResponse.json(
        { ok: false, error: partError.message },
        { status: 500 },
      );
    }
    if (!part) {
      return NextResponse.json(
        { ok: false, error: "Selected part is not available in this shop" },
        { status: 403 },
      );
    }
  }

  if (vendorId) {
    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", vendorId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (supplierError) {
      return NextResponse.json(
        { ok: false, error: supplierError.message },
        { status: 500 },
      );
    }
    if (!supplier) {
      return NextResponse.json(
        { ok: false, error: "Selected supplier is not available in this shop" },
        { status: 403 },
      );
    }
  }

  const nextQty = qty == null ? null : Math.max(1, Math.floor(qty));
  if (quotedPrice != null && quotedPrice < 0) {
    return NextResponse.json(
      { ok: false, error: "quotedPrice must be zero or greater" },
      { status: 400 },
    );
  }
  if (nextQty != null && nextQty <= 0) {
    return NextResponse.json(
      { ok: false, error: "qty must be greater than zero" },
      { status: 400 },
    );
  }

  const description = cleanString(body.description) ?? cleanString(body.notes);
  const vendor = cleanString(body.vendor);
  const requestedPartNumber = cleanString(body.requestedPartNumber);
  const requestedManufacturer = cleanString(body.requestedManufacturer);
  const quoteComplete = isPartsRequestItemPriced({
    description: description ?? item.description,
    partId: partId ?? item.part_id,
    requestedPartNumber: requestedPartNumber ?? item.requested_part_number,
    requestedManufacturer: requestedManufacturer ?? item.requested_manufacturer,
    qty: nextQty ?? item.qty,
    qtyRequested: nextQty ?? item.qty_requested,
    quotedPrice: quotedPrice ?? item.quoted_price,
    unitPrice: quotedPrice ?? item.unit_price,
  });

  const update: PartRequestItemUpdate = {
    updated_at: new Date().toISOString(),
    work_order_line_id: null,
    ...(description ? { description } : {}),
    ...(nextQty != null ? { qty: nextQty, qty_requested: nextQty } : {}),
    ...(quotedPrice != null
      ? { quoted_price: quotedPrice, unit_price: quotedPrice }
      : {}),
    ...(vendorId !== null ? { vendor_id: vendorId } : {}),
    ...(vendor !== null ? { vendor } : {}),
    ...(partId !== null ? { part_id: partId } : {}),
    requested_part_number: requestedPartNumber,
    requested_manufacturer: requestedManufacturer,
    status: (quoteComplete
      ? "quoted"
      : "requested") as PartRequestItemUpdate["status"],
  };

  const { data: updatedItem, error: updateError } = await supabase
    .from("part_request_items")
    .update(update)
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .eq("request_id", item.request_id)
    .eq("quote_line_id", itemQuoteLineId)
    .is("work_order_line_id", null)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 500 },
    );
  }
  if (!updatedItem) {
    return NextResponse.json(
      { ok: false, error: "Quote save did not apply" },
      { status: 409 },
    );
  }

  const sync = await syncQuoteLinePartsStatus(supabase, {
    shopId,
    quoteLineId: itemQuoteLineId,
  });

  return NextResponse.json(
    {
      ok: sync.ok,
      item: updatedItem,
      sync,
      notice: "Quote saved. Allocation will unlock after customer approval.",
      error: sync.ok ? undefined : sync.error,
    },
    { status: sync.ok ? 200 : 500 },
  );
}
