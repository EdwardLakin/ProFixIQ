import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  DEFAULT_STRIPE_PLATFORM_FEE_BPS,
  MAX_STRIPE_PLATFORM_FEE_BPS,
} from "@/features/stripe/lib/stripe/billing-model";

type DB = Database;

export type ShopPaymentSettings = {
  shop_id: string;
  portal_payments_enabled: boolean;
  default_currency: "cad" | "usd";
  platform_fee_bps: number;
  allow_partial_payments: boolean;
  minimum_payment_cents: number;
  default_deposit_percent: number;
  require_payment_before_release: boolean;
  receipt_email_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ShopPaymentSettingsPatch = Partial<
  Omit<ShopPaymentSettings, "shop_id" | "created_at" | "updated_at">
>;

const TABLE = "shop_payment_settings" as keyof DB["public"]["Tables"];

export function defaultShopPaymentSettings(shopId: string): ShopPaymentSettings {
  return {
    shop_id: shopId,
    portal_payments_enabled: false,
    default_currency: "cad",
    platform_fee_bps: DEFAULT_STRIPE_PLATFORM_FEE_BPS,
    allow_partial_payments: false,
    minimum_payment_cents: 50,
    default_deposit_percent: 0,
    require_payment_before_release: false,
    receipt_email_enabled: true,
  };
}

export function normalizeShopPaymentSettings(
  shopId: string,
  value: Partial<ShopPaymentSettings> | null | undefined,
): ShopPaymentSettings {
  const defaults = defaultShopPaymentSettings(shopId);
  const currency = String(value?.default_currency ?? defaults.default_currency).toLowerCase();
  const fee = Math.trunc(Number(value?.platform_fee_bps ?? defaults.platform_fee_bps));
  const minimum = Math.trunc(
    Number(value?.minimum_payment_cents ?? defaults.minimum_payment_cents),
  );
  const deposit = Number(
    value?.default_deposit_percent ?? defaults.default_deposit_percent,
  );

  return {
    ...defaults,
    ...value,
    shop_id: shopId,
    default_currency: currency === "usd" ? "usd" : "cad",
    platform_fee_bps: Math.max(
      0,
      Math.min(MAX_STRIPE_PLATFORM_FEE_BPS, Number.isFinite(fee) ? fee : 0),
    ),
    minimum_payment_cents: Math.max(
      50,
      Number.isFinite(minimum) ? minimum : defaults.minimum_payment_cents,
    ),
    default_deposit_percent: Math.max(
      0,
      Math.min(100, Number.isFinite(deposit) ? deposit : 0),
    ),
  };
}

export async function getShopPaymentSettings(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<ShopPaymentSettings> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "shop_id, portal_payments_enabled, default_currency, platform_fee_bps, allow_partial_payments, minimum_payment_cents, default_deposit_percent, require_payment_before_release, receipt_email_enabled, created_at, updated_at",
    )
    .eq("shop_id", shopId)
    .maybeSingle<ShopPaymentSettings>();

  if (error) throw new Error(error.message);
  return normalizeShopPaymentSettings(shopId, data);
}

export async function saveShopPaymentSettings(
  supabase: SupabaseClient<DB>,
  shopId: string,
  patch: ShopPaymentSettingsPatch,
): Promise<ShopPaymentSettings> {
  const current = await getShopPaymentSettings(supabase, shopId);
  const normalized = normalizeShopPaymentSettings(shopId, {
    ...current,
    ...patch,
  });

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(normalized as never, { onConflict: "shop_id" })
    .select(
      "shop_id, portal_payments_enabled, default_currency, platform_fee_bps, allow_partial_payments, minimum_payment_cents, default_deposit_percent, require_payment_before_release, receipt_email_enabled, created_at, updated_at",
    )
    .single<ShopPaymentSettings>();

  if (error) throw new Error(error.message);
  return normalizeShopPaymentSettings(shopId, data);
}
