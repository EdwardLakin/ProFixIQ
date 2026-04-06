import { NextResponse } from "next/server";
import { requireBrandShopWriteAccess } from "@/features/branding/server/brand";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireBrandShopWriteAccess();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, auth.shopId);
  if (!pinCheck.ok) return pinCheck.response;

  const body = (await req.json().catch(() => ({}))) as { archived?: boolean };
  const archived = Boolean(body.archived);

  const { data: asset, error: assetErr } = await auth.supabase
    .from("shop_brand_assets")
    .select("id, shop_id, is_active")
    .eq("id", id)
    .eq("shop_id", auth.shopId)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (archived && asset.is_active) {
    return NextResponse.json({ error: "Cannot archive active logo" }, { status: 400 });
  }

  const patch = archived
    ? { archived_at: new Date().toISOString(), archived_by: auth.userId }
    : { archived_at: null, archived_by: null };

  const { error } = await auth.supabase
    .from("shop_brand_assets")
    .update(patch)
    .eq("id", id)
    .eq("shop_id", auth.shopId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
