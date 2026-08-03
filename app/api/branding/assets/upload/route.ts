import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  requireBrandShopWriteAccess,
  safeFilePart,
} from "@/features/branding/server/brand";
import {
  OWNER_PIN_PURPOSES,
  requireOwnerPinVerified,
} from "@/features/shared/lib/server/owner-pin";
import { readRasterImageDimensions } from "@/features/branding/server/imageDimensions";

type DB = Database;
type BrandAssetKind = DB["public"]["Enums"]["brand_asset_kind"];

const ALLOWED_KINDS = new Set<BrandAssetKind>([
  "logo",
  "icon",
  "wordmark",
  "badge",
  "favicon",
  "watermark",
]);

export async function POST(req: Request) {
  const form = await req.formData();
  const requestedShopId = String(form.get("shopId") ?? "").trim() || null;

  const auth = await requireBrandShopWriteAccess(requestedShopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, {
    shopId: auth.shopId,
    userId: auth.userId,
    allowedPurposes: [
      OWNER_PIN_PURPOSES.BRANDING,
      OWNER_PIN_PURPOSES.PRIVILEGED,
    ],
  });
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const kind = String(form.get("kind") ?? "").trim() as BrandAssetKind;
  const isActive = String(form.get("isActive") ?? "").trim() === "true";
  const file = form.get("file");

  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const ext = file.name.includes(".")
    ? (file.name.split(".").pop()?.toLowerCase() ?? "bin")
    : "bin";

  const filePart = safeFilePart(
    file.name.replace(/\.[^.]+$/, "") || `${kind}_${Date.now()}`,
  );
  const path = `shops/${safeFilePart(auth.shopId)}/branding/${kind}/${Date.now()}_${filePart}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const dimensions = readRasterImageDimensions(bytes);

  const { error: uploadErr } = await auth.supabase.storage
    .from("branding")
    .upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicData } = auth.supabase.storage
    .from("branding")
    .getPublicUrl(path);

  const insert: DB["public"]["Tables"]["shop_brand_assets"]["Insert"] = {
    shop_id: auth.shopId,
    kind,
    file_url: publicData.publicUrl,
    storage_bucket: "branding",
    storage_path: path,
    source_app: "profixiq",
    mime_type: file.type || null,
    file_name: file.name,
    file_size_bytes: file.size,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    is_active: isActive,
    created_by: auth.userId,
    metadata: dimensions
      ? { aspect_ratio: dimensions.width / dimensions.height }
      : {},
  };

  const { data: asset, error: insertErr } = await auth.supabase
    .from("shop_brand_assets")
    .insert(insert)
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    asset,
  });
}
