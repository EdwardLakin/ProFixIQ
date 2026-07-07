import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const money = (v: unknown) => v === null || v === "" || v === undefined ? null : Number(v);
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!uuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid item id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = s(b?.name);
  if (!name) return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
  const cost = money(b?.cost); const price = money(b?.sellPrice); const initialQty = Number(b?.initialQty ?? 0);
  if ((cost !== null && (!Number.isFinite(cost) || cost < 0)) || (price !== null && (!Number.isFinite(price) || price < 0)) || !Number.isFinite(initialQty) || initialQty < 0) {
    return NextResponse.json({ ok: false, error: "Cost, sell price, and initial qty must be valid non-negative numbers." }, { status: 400 });
  }
  const partInsert: DB["public"]["Tables"]["parts"]["Insert"] = { shop_id: access.profile.shop_id, name, part_number: s(b?.partNumber), sku: s(b?.sku) ?? s(b?.partNumber), category: s(b?.category), cost, price, default_price: price, supplier: s(b?.defaultSupplier) ?? s(b?.manufacturer) };
  const { data: part, error: partError } = await access.supabase.from("parts").insert(partInsert).select("*").single();
  if (partError) return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
  if (initialQty > 0) {
    const locationId = s(b?.locationId);
    if (!locationId || !uuid(locationId)) return NextResponse.json({ ok: false, error: "A valid location is required when initial qty is greater than 0." }, { status: 400 });
    const move: DB["public"]["Tables"]["stock_moves"]["Insert"] = { shop_id: access.profile.shop_id ?? "", part_id: part.id, location_id: locationId, qty_change: initialQty, reason: "adjust", reference_kind: "part_request_item", reference_id: itemId };
    const { error } = await access.supabase.from("stock_moves").insert(move);
    if (error) return NextResponse.json({ ok: false, error: `Part created, but initial stock failed: ${error.message}` }, { status: 500 });
  }
  const update: DB["public"]["Tables"]["part_request_items"]["Update"] = { part_id: part.id, requested_part_number: s(b?.partNumber), requested_manufacturer: s(b?.manufacturer), quoted_price: price, unit_price: price, updated_at: new Date().toISOString() };
  const { data: item, error } = await access.supabase.from("part_request_items").update(update).eq("id", itemId).eq("shop_id", access.profile.shop_id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, part, item });
}
