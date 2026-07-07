import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  if (!uuid(itemId)) return NextResponse.json({ ok: false, error: "Invalid item id." }, { status: 400 });
  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;
  const body = (await req.json().catch(() => null)) as { partId?: unknown } | null;
  if (!uuid(body?.partId)) return NextResponse.json({ ok: false, error: "Choose a valid inventory part." }, { status: 400 });
  const { data: part, error: partError } = await access.supabase.from("parts").select("id").eq("id", body.partId).eq("shop_id", access.profile.shop_id).maybeSingle();
  if (partError) return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
  if (!part) return NextResponse.json({ ok: false, error: "Inventory part not found for this shop." }, { status: 404 });
  const update: DB["public"]["Tables"]["part_request_items"]["Update"] = { part_id: body.partId, updated_at: new Date().toISOString() };
  const { data, error } = await access.supabase.from("part_request_items").update(update).eq("id", itemId).eq("shop_id", access.profile.shop_id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Request item not found for this shop." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}
