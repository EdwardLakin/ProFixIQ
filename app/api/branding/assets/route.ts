import { NextResponse } from "next/server";
import type { Database, Json } from "@shared/types/types/supabase";
import { requireBrandShopAccess } from "@/features/branding/server/brand";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type DB = Database;
type BrandAssetKind = DB["public"]["Enums"]["brand_asset_kind"];
type BrandSourceApp = DB["public"]["Enums"]["brand_source_app"];

type CreateAssetBody = {
  shopId?: string;
  kind?: BrandAssetKind;
  fileUrl?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  sourceApp?: BrandSourceApp;
  generationProvider?: string | null;
  generationPrompt?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  isActive?: boolean;
  metadata?: Json;
};

const ALLOWED_KINDS = new Set<BrandAssetKind>([
  "logo",
  "icon",
  "wordmark",
  "badge",
  "favicon",
  "watermark",
]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  const kind = url.searchParams.get("kind");

  const auth = await requireBrandShopAccess(shopId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let query = auth.supabase
    .from("shop_brand_assets")
    .select("*")
    .eq("shop_id", auth.shopId)
    .order("created_at", { ascending: false });

  if (kind && ALLOWED_KINDS.has(kind as BrandAssetKind)) {
    query = query.eq("kind", kind as BrandAssetKind);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assets: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateAssetBody;
  const auth = await requireBrandShopAccess(body.shopId);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, auth.shopId);
  if (!pinCheck.ok) {
    return pinCheck.response;
  }

  const kind = body.kind;
  if (!kind || !ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!body.fileUrl && !body.storagePath) {
    return NextResponse.json(
      { error: "fileUrl or storagePath is required" },
      { status: 400 }
    );
  }

  const insert: DB["public"]["Tables"]["shop_brand_assets"]["Insert"] = {
    shop_id: auth.shopId,
    kind,
    file_url: body.fileUrl?.trim() || null,
    storage_bucket: body.storageBucket?.trim() || null,
    storage_path: body.storagePath?.trim() || null,
    source_app: body.sourceApp ?? "profixiq",
    generation_provider: body.generationProvider?.trim() || null,
    generation_prompt: body.generationPrompt?.trim() || null,
    mime_type: body.mimeType?.trim() || null,
    file_name: body.fileName?.trim() || null,
    file_size_bytes: typeof body.fileSizeBytes === "number" ? body.fileSizeBytes : null,
    width: typeof body.width === "number" ? body.width : null,
    height: typeof body.height === "number" ? body.height : null,
    is_active: Boolean(body.isActive),
    created_by: auth.userId,
    metadata: body.metadata ?? {},
  };

  const { data, error } = await auth.supabase
    .from("shop_brand_assets")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asset: data });
}