import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type POLineInsert = DB["public"]["Tables"]["purchase_order_lines"]["Insert"] & { part_request_item_id?: string | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const num = (v: unknown) => typeof v === "number" ? v : Number(v);
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!uuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid item id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const b = (await req.json().catch(() => null)) as { supplierId?: unknown; poId?: unknown; createNew?: boolean; qty?: unknown; unitCost?: unknown; expectedAt?: unknown } | null;
  if (!uuid(b?.supplierId)) return NextResponse.json({ ok: false, error: "Supplier is required." }, { status: 400 });
  const qty = num(b?.qty); const unitCost = num(b?.unitCost ?? 0);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return NextResponse.json({ ok: false, error: "Qty must be > 0 and unit cost must be >= 0." }, { status: 400 });
  const { data: item, error: itemError } = await access.supabase.from("part_request_items").select("*").eq("id", itemId).eq("shop_id", access.profile.shop_id).maybeSingle();
  if (itemError) return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: false, error: "Request item not found for this shop." }, { status: 404 });
  let poId = uuid(b?.poId) && !b?.createNew ? b.poId : null;
  if (!poId) {
    const { data: po, error } = await access.supabase.from("purchase_orders").insert({ shop_id: access.profile.shop_id ?? "", supplier_id: b.supplierId, status: "open", expected_at: typeof b?.expectedAt === "string" && b.expectedAt ? b.expectedAt : null } as DB["public"]["Tables"]["purchase_orders"]["Insert"]).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    poId = po.id;
  }
  if (!poId) return NextResponse.json({ ok: false, error: "Could not create or select a PO." }, { status: 500 });
  const { data: existing } = await access.supabase.from("purchase_order_lines").select("id").eq("po_id", poId).eq("part_request_item_id", itemId).maybeSingle();
  if (existing?.id) {
    await access.supabase.from("purchase_order_lines").update({ qty, unit_cost: unitCost } as DB["public"]["Tables"]["purchase_order_lines"]["Update"]).eq("id", existing.id);
  } else {
    const line: POLineInsert = { po_id: poId, part_id: item.part_id, description: item.description, qty, unit_cost: unitCost, part_request_item_id: itemId };
    const { error } = await access.supabase.from("purchase_order_lines").insert(line);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const { data: updated, error } = await access.supabase.from("part_request_items").update({ po_id: poId, vendor_id: b.supplierId, unit_cost: unitCost, updated_at: new Date().toISOString() } as DB["public"]["Tables"]["part_request_items"]["Update"]).eq("id", itemId).eq("shop_id", access.profile.shop_id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: updated, poId });
}
