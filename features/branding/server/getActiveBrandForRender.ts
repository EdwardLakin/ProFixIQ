import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  resolveInvoiceDocumentConfiguration,
  type InvoiceDocumentConfiguration,
} from "@/features/invoices/lib/invoiceDocumentTheme";

type DB = Database;

export type ActiveBrandRender = {
  profile: DB["public"]["Tables"]["shop_brand_profiles"]["Row"] | null;
  logoUrl: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  theme: Record<string, unknown> | null;
  document: InvoiceDocumentConfiguration;
};

export async function getActiveBrandForRender(
  shopId: string,
): Promise<ActiveBrandRender> {
  const supabase = createClient<DB>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from("shop_brand_profiles")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();

  const [{ data: assets }, { data: shop }] = await Promise.all([
    supabase
      .from("shop_brand_assets")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_active", true),
    supabase
      .from("shops")
      .select("logo_url,invoice_terms,invoice_footer")
      .eq("id", shopId)
      .maybeSingle<{
        logo_url: string | null;
        invoice_terms: string | null;
        invoice_footer: string | null;
      }>(),
  ]);

  let logo = (assets ?? []).find((a) => a.kind === "logo") ?? null;
  if (profile?.logo_asset_id && logo?.id !== profile.logo_asset_id) {
    const { data: selectedLogo } = await supabase
      .from("shop_brand_assets")
      .select("*")
      .eq("id", profile.logo_asset_id)
      .eq("shop_id", shopId)
      .eq("kind", "logo")
      .maybeSingle();
    logo = selectedLogo ?? logo;
  }
  const metadata =
    profile && typeof profile.metadata === "object" && profile.metadata
      ? (profile.metadata as Record<string, unknown>)
      : null;

  const documentSettings = metadata?.invoice_document;
  const logoUrl = logo?.file_url ?? shop?.logo_url ?? null;
  const document = resolveInvoiceDocumentConfiguration({
    settings: documentSettings,
    logoUrl,
    terms: shop?.invoice_terms,
    footer: shop?.invoice_footer,
  });

  return {
    profile: profile ?? null,
    logoUrl,
    colors: document.colors,
    theme:
      metadata && typeof metadata.theme === "object"
        ? (metadata.theme as Record<string, unknown>)
        : null,
    document,
  };
}

export function activeBrandFromFrozenDocument(
  document: InvoiceDocumentConfiguration,
): ActiveBrandRender {
  return {
    profile: null,
    logoUrl: document.logoUrl,
    colors: document.colors,
    theme: null,
    document,
  };
}
