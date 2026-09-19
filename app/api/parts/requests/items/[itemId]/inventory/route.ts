import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"] & {
  manufacturer?: string | null;
};

type Body =
  | { mode: "attach"; partId: string }
  | {
      mode: "create";
      name: string;
      partNumber?: string | null;
      manufacturer?: string | null;
      supplier?: string | null;
      sku?: string | null;
      category?: string | null;
      cost?: number | string | null;
      sellPrice?: number | string | null;
      initialQty?: number | string | null;
      locationId?: string | null;
    };

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const ATTACH_ERROR_MESSAGES: Record<string, string> = {
  PARTS_ORDERED_PART_ID_MISMATCH:
    "This part is already on a purchase order line for a different inventory item. Remove it from the PO before changing the match.",
  PARTS_REQUEST_ALREADY_MAPPED:
    "This line has already been ordered or received against its current part and can no longer be re-matched.",
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function suppliedNumber(
  body: Record<string, unknown>,
  key: string,
): { supplied: boolean; value: number | null } {
  if (!(key in body) || body[key] == null || body[key] === "") {
    return { supplied: false, value: null };
  }
  const raw = body[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return { supplied: true, value: Number.isFinite(value) ? value : null };
}

function stableOperationKey(itemId: string, body: Extract<Body, { mode: "create" }>): string {
  const normalized = JSON.stringify({
    itemId,
    name: clean(body.name),
    partNumber: clean(body.partNumber),
    manufacturer: clean(body.manufacturer),
    supplier: clean(body.supplier),
    sku: clean(body.sku),
    category: clean(body.category),
    cost: body.cost ?? null,
    sellPrice: body.sellPrice ?? null,
    initialQty: body.initialQty ?? null,
    locationId: clean(body.locationId),
  });
  return `request-inventory:${itemId}:${createHash("sha256").update(normalized).digest("hex")}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid itemId." }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageParts" });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { data: item, error: itemError } = await access.supabase
    .from("part_request_items")
    .select(
      "id,shop_id,part_id,requested_manufacturer,quote_line_id,work_order_line_id,qty,qty_requested,quoted_price,unit_price",
    )
    .eq("id", itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (itemError) {
    return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "Request item not found." }, { status: 404 });
  }

  if (body.mode === "attach") {
    if (!isUuid(body.partId)) {
      return NextResponse.json({ ok: false, error: "Invalid partId." }, { status: 400 });
    }
    const { data: part, error: partError } = await access.supabase
      .from("parts")
      .select("*")
      .eq("id", body.partId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();
    if (partError) {
      return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
    }
    if (!part) {
      return NextResponse.json({ ok: false, error: "Inventory part not found." }, { status: 404 });
    }

    // Quote-origin items are intentionally not linked to a work-order line until
    // approval materializes the repair. Persist the inventory choice directly on
    // the quote item instead of invoking the operational attach RPC, which must
    // create a work_order_part and therefore requires a materialized line.
    if (isUuid(item.quote_line_id) && !isUuid(item.work_order_line_id)) {
      const selectedSellPrice =
        item.quoted_price ?? item.unit_price ?? part.price ?? part.default_price ?? null;
      const { data: updatedItem, error: quoteAttachError } = await access.supabase
        .from("part_request_items")
        .update({
          part_id: part.id,
          requested_part_number:
            clean(part.part_number) ?? clean(part.sku),
          requested_manufacturer:
            clean(part.manufacturer) ?? clean(part.supplier),
          ...(selectedSellPrice == null
            ? {}
            : {
                quoted_price: selectedSellPrice,
                unit_price: selectedSellPrice,
              }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("shop_id", access.profile.shop_id)
        .eq("quote_line_id", item.quote_line_id)
        .is("work_order_line_id", null)
        .select("*")
        .maybeSingle();

      if (quoteAttachError || !updatedItem) {
        return NextResponse.json(
          {
            ok: false,
            code: "PARTS_QUOTE_INVENTORY_ATTACH_FAILED",
            error: quoteAttachError?.message ?? "Inventory selection did not persist.",
          },
          { status: 409 },
        );
      }

      const sync = await syncQuoteLinePartsStatus(access.supabase, {
        shopId: access.profile.shop_id,
        quoteLineId: item.quote_line_id,
      });
      if (!sync.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "PARTS_QUOTE_SYNC_FAILED",
            error: sync.error ?? "Inventory selection persisted but quote sync failed.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ok: true,
        item: updatedItem,
        partId: part.id,
        part,
      });
    }

    const rpc = access.supabase as unknown as RpcClient;
    const { data: attachData, error: updateError } = await rpc.rpc(
      "parts_attach_inventory_to_request_item_atomic",
      { p_item_id: itemId, p_part_id: part.id },
    );
    const attachResult = (
      Array.isArray(attachData) ? attachData[0] : attachData
    ) as {
      item?: unknown;
      part_id?: string;
    } | null;
    if (updateError || !attachResult?.part_id) {
      const stableError =
        updateError?.message?.match(/^PARTS_[A-Z0-9_]+$/)?.[0];
      const code = stableError ?? "PARTS_INVENTORY_ATTACH_FAILED";
      const error = stableError
        ? (ATTACH_ERROR_MESSAGES[stableError] ?? stableError)
        : "Inventory selection did not persist.";
      return NextResponse.json({ ok: false, code, error }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      item: attachResult.item ?? null,
      partId: attachResult.part_id,
      part,
    });
  }

  const name = clean(body.name);
  if (!name) {
    return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  }
  const cost = suppliedNumber(body as unknown as Record<string, unknown>, "cost");
  const sellPrice = suppliedNumber(body as unknown as Record<string, unknown>, "sellPrice");
  const initialQty = suppliedNumber(body as unknown as Record<string, unknown>, "initialQty");
  for (const [label, parsed] of [
    ["Cost", cost],
    ["Sell price", sellPrice],
    ["Initial quantity", initialQty],
  ] as const) {
    if (parsed.supplied && parsed.value == null) {
      return NextResponse.json({ ok: false, error: `${label} must be a valid number.` }, { status: 400 });
    }
    if ((parsed.value ?? 0) < 0) {
      return NextResponse.json({ ok: false, error: `${label} must be zero or greater.` }, { status: 400 });
    }
  }
  const locationId = clean(body.locationId);
  if ((initialQty.value ?? 0) > 0 && !isUuid(locationId)) {
    return NextResponse.json({ ok: false, error: "Location is required for initial quantity." }, { status: 400 });
  }

  const rpc = access.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("parts_create_and_attach_inventory_atomic", {
    p_item_id: itemId,
    p_name: name,
    p_part_number: clean(body.partNumber),
    p_manufacturer: clean(body.manufacturer) ?? clean(item.requested_manufacturer),
    p_supplier: clean(body.supplier),
    p_sku: clean(body.sku) ?? clean(body.partNumber),
    p_category: clean(body.category),
    p_cost: cost.value,
    p_sell_price: sellPrice.value,
    p_initial_qty: initialQty.value ?? 0,
    p_location_id: locationId,
    p_operation_key: stableOperationKey(itemId, body),
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    part_id?: string;
    item?: unknown;
    part?: PartRow;
  } | null;
  if (!result?.part_id) {
    return NextResponse.json({ ok: false, error: "Inventory operation returned no part." }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    item: result.item ?? null,
    partId: result.part_id,
    part: result.part ?? null,
  });
}
