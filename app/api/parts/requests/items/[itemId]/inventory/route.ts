import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

type Body =
  | { mode: "attach"; partId: string }
  | {
      mode: "create";
      name: string;
      partNumber?: string | null;
      manufacturer?: string | null;
      sku?: string | null;
      category?: string | null;
      sellPrice?: number | string | null;
      initialQty?: number | string | null;
      locationId?: string | null;
    };

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!isUuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid itemId." }, { status: 400 });

  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const shopId = access.profile.shop_id;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });

  const { data: item, error: itemError } = await supabase
    .from("part_request_items")
    .select("id, shop_id, request_id, requested_part_number, requested_manufacturer")
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (itemError) return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: false, error: "Request item not found." }, { status: 404 });

  let partId: string;
  let selectedPart: DB["public"]["Tables"]["parts"]["Row"] | null = null;
  if (body.mode === "attach") {
    if (!isUuid(body.partId)) return NextResponse.json({ ok: false, error: "Invalid partId." }, { status: 400 });

    const { data: part, error: partError } = await supabase
      .from("parts")
      .select("*")
      .eq("id", body.partId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (partError) return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
    if (!part) return NextResponse.json({ ok: false, error: "Inventory part not found." }, { status: 404 });
    partId = part.id;
    selectedPart = part as DB["public"]["Tables"]["parts"]["Row"];
  } else {
    const name = clean(body.name);
    if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });

    const sellPrice = num(body.sellPrice);
    if (sellPrice != null && sellPrice < 0) {
      return NextResponse.json({ ok: false, error: "Sell price must be zero or greater." }, { status: 400 });
    }

    const insert = {
      shop_id: shopId,
      name,
      part_number: clean(body.partNumber),
      sku: clean(body.sku) ?? clean(body.partNumber),
      category: clean(body.category),
      price: sellPrice,
      default_price: sellPrice,
      supplier: clean(body.manufacturer),
    } satisfies DB["public"]["Tables"]["parts"]["Insert"];

    const { data: part, error: partError } = await supabase
      .from("parts")
      .insert(insert)
      .select("*")
      .single();

    if (partError) return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
    partId = part.id;
    selectedPart = part as DB["public"]["Tables"]["parts"]["Row"];

    const initialQty = num(body.initialQty) ?? 0;
    const locationId = clean(body.locationId);
    if (initialQty > 0) {
      if (!isUuid(locationId)) return NextResponse.json({ ok: false, error: "Location is required for initial qty." }, { status: 400 });

      const { error: stockError } = await supabase.rpc("apply_stock_move", {
        p_part: partId,
        p_loc: locationId,
        p_qty: initialQty,
        p_reason: "receive",
        p_ref_kind: "parts_request_initial_stock",
        p_ref_id: partId,
      });

      if (stockError) return NextResponse.json({ ok: false, error: stockError.message }, { status: 500 });
    }
  }

  const { data: updatedItem, error: updateError } = await supabase
    .from("part_request_items")
    .update({
      part_id: partId,
      updated_at: new Date().toISOString(),
    } as DB["public"]["Tables"]["part_request_items"]["Update"])
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .select("*")
    .maybeSingle();

  if (updateError) return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  if (!updatedItem) {
    return NextResponse.json({ ok: false, error: "Inventory selection did not persist. The item may have changed or your shop access was blocked." }, { status: 409 });
  }
  if (updatedItem.part_id !== partId) {
    return NextResponse.json({ ok: false, error: "Inventory selection verification failed. Reload and try again." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    item: updatedItem,
    partId,
    part: selectedPart
      ? {
          id: selectedPart.id,
          name: selectedPart.name,
          sku: selectedPart.sku,
          part_number: selectedPart.part_number,
          manufacturer: selectedPart.supplier,
          sell_price: selectedPart.price ?? selectedPart.default_price ?? null,
        }
      : null,
  });
}
