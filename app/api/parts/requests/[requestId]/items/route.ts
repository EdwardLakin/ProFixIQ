import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await ctx.params;
  if (!uuid(requestId)) return NextResponse.json({ ok: false, error: "Invalid request id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const { data: parent, error: parentError } = await access.supabase.from("part_requests").select("id, shop_id, work_order_id, quote_line_id").eq("id", requestId).eq("shop_id", access.profile.shop_id).maybeSingle();
  if (parentError) return NextResponse.json({ ok: false, error: parentError.message }, { status: 500 });
  if (!parent) return NextResponse.json({ ok: false, error: "Parts request not found for this shop." }, { status: 404 });
  const insert: DB["public"]["Tables"]["part_request_items"]["Insert"] = { request_id: parent.id, shop_id: parent.shop_id, work_order_id: parent.work_order_id, quote_line_id: parent.quote_line_id, description: "", qty: 1, qty_requested: 1, quoted_price: 0, unit_price: 0, part_id: null };
  const { data, error } = await access.supabase.from("part_request_items").insert(insert).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
