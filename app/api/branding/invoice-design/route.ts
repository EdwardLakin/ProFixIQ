import { NextResponse } from "next/server";
import type { Json } from "@shared/types/types/supabase";
import {
  requireBrandShopReadAccess,
  requireBrandShopWriteAccess,
} from "@/features/branding/server/brand";
import {
  OWNER_PIN_PURPOSES,
  requireOwnerPinVerified,
} from "@/features/shared/lib/server/owner-pin";
import {
  INVOICE_PALETTES,
  INVOICE_TEMPLATES,
  normalizeInvoiceDocumentSettings,
} from "@/features/invoices/lib/invoiceDocumentTheme";

type Payload = {
  shopId?: string;
  settings?: unknown;
};

function metadataObject(
  value: Json | null | undefined,
): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

export async function GET(req: Request) {
  const requestedShopId = new URL(req.url).searchParams.get("shopId");
  const auth = await requireBrandShopReadAccess(requestedShopId);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("shop_brand_profiles")
    .select("metadata")
    .eq("shop_id", auth.shopId)
    .maybeSingle<{ metadata: Json | null }>();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const metadata = metadataObject(data?.metadata);
  return NextResponse.json({
    ok: true,
    settings: normalizeInvoiceDocumentSettings(metadata.invoice_document),
    templates: INVOICE_TEMPLATES,
    palettes: INVOICE_PALETTES,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Payload;
  const auth = await requireBrandShopWriteAccess(body.shopId);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const pinCheck = await requireOwnerPinVerified(req, auth.supabase as never, {
    shopId: auth.shopId,
    userId: auth.userId,
    allowedPurposes: [
      OWNER_PIN_PURPOSES.SETTINGS,
      OWNER_PIN_PURPOSES.BRANDING,
      OWNER_PIN_PURPOSES.PRIVILEGED,
    ],
  });
  if (!pinCheck.ok) return pinCheck.response;

  const settings = normalizeInvoiceDocumentSettings(body.settings);
  const { data: current, error: readError } = await auth.supabase
    .from("shop_brand_profiles")
    .select("metadata")
    .eq("shop_id", auth.shopId)
    .maybeSingle<{ metadata: Json | null }>();
  if (readError)
    return NextResponse.json({ error: readError.message }, { status: 500 });

  const metadata = metadataObject(current?.metadata);
  const { error } = await auth.supabase.from("shop_brand_profiles").upsert(
    {
      shop_id: auth.shopId,
      metadata: { ...metadata, invoice_document: settings } as Json,
      updated_by: auth.userId,
    },
    { onConflict: "shop_id" },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, settings });
}
