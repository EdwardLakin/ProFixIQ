import { NextResponse } from "next/server";
import { requireBrandShopAccess } from "@/features/branding/server/brand";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireBrandShopAccess();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, auth.shopId);
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const { data: asset, error: assetErr } = await auth.supabase
    .from("shop_brand_assets")
    .select("*")
    .eq("id", id)
    .eq("shop_id", auth.shopId)
    .single();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { error: activateErr } = await auth.supabase
    .from("shop_brand_assets")
    .update({ is_active: true })
    .eq("id", asset.id)
    .eq("shop_id", auth.shopId);

  if (activateErr) {
    return NextResponse.json({ error: activateErr.message }, { status: 500 });
  }

  const profilePatch: Record<string, string | null> = {};
  if (asset.kind === "logo") profilePatch.logo_asset_id = asset.id;
  if (asset.kind === "icon") profilePatch.icon_asset_id = asset.id;
  if (asset.kind === "wordmark") profilePatch.wordmark_asset_id = asset.id;
  if (asset.kind === "watermark") profilePatch.watermark_asset_id = asset.id;

  if (Object.keys(profilePatch).length > 0) {
    const { error: profileErr } = await auth.supabase
      .from("shop_brand_profiles")
      .upsert({
        shop_id: auth.shopId,
        ...profilePatch,
        updated_by: auth.userId,
      }, { onConflict: "shop_id" });

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }
  }

  if (asset.kind === "logo" && asset.file_url) {
    const { error: shopErr } = await auth.supabase
      .from("shops")
      .update({ logo_url: asset.file_url })
      .eq("id", auth.shopId);

    if (shopErr) {
      return NextResponse.json({ error: shopErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}