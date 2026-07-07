import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type Body = { description?: unknown; requestedPartNumber?: unknown; requestedManufacturer?: unknown; qty?: unknown; quotedPrice?: unknown };
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!uuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid item id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  const description = str(body.description);
  const qty = num(body.qty);
  const quotedPrice = body.quotedPrice === null || body.quotedPrice === "" ? null : num(body.quotedPrice);
  if (!description) return NextResponse.json({ ok: false, error: "Description is required." }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ ok: false, error: "Quantity must be greater than 0." }, { status: 400 });
  if (quotedPrice !== null && (!Number.isFinite(quotedPrice) || quotedPrice < 0)) return NextResponse.json({ ok: false, error: "Price must be 0 or greater." }, { status: 400 });

  const update: DB["public"]["Tables"]["part_request_items"]["Update"] = {
    description,
    requested_part_number: str(body.requestedPartNumber),
    requested_manufacturer: str(body.requestedManufacturer),
    qty,
    qty_requested: qty,
    quoted_price: quotedPrice,
    unit_price: quotedPrice,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await access.supabase.from("part_request_items").update(update).eq("id", itemId).eq("shop_id", access.profile.shop_id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Request item not found for this shop." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}
