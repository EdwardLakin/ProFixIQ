import { NextResponse } from "next/server";
import { requireBrandShopWriteAccess } from "@/features/branding/server/brand";
import { OWNER_PIN_PURPOSES, requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireBrandShopWriteAccess();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, {
    shopId: auth.shopId,
    userId: auth.userId,
    allowedPurposes: [OWNER_PIN_PURPOSES.BRANDING, OWNER_PIN_PURPOSES.PRIVILEGED],
  });
  if (!pinCheck.ok) return pinCheck.response;

  const { data: asset, error: assetErr } = await auth.supabase
    .from("shop_brand_assets")
    .select("id, shop_id, is_active, storage_bucket, storage_path")
    .eq("id", id)
    .eq("shop_id", auth.shopId)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.is_active) {
    return NextResponse.json({ error: "Cannot delete active logo" }, { status: 400 });
  }

  if (asset.storage_bucket && asset.storage_path) {
    const { error: removeErr } = await auth.supabase.storage
      .from(asset.storage_bucket)
      .remove([asset.storage_path]);

    if (removeErr) {
      return NextResponse.json({ error: removeErr.message }, { status: 500 });
    }
  }

  const { error } = await auth.supabase
    .from("shop_brand_assets")
    .delete()
    .eq("id", id)
    .eq("shop_id", auth.shopId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
