import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(_req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!uuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid item id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const { data, error } = await access.supabase.from("part_request_items").delete().eq("id", itemId).eq("shop_id", access.profile.shop_id).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Request item not found for this shop." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
