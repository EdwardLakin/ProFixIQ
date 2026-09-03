import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { ProductCapability } from "@/features/stripe/lib/stripe/product-packages";

export const SHOP_PRODUCT_CAPABILITIES = ["shop"] as const;
export const FIELD_PRODUCT_CAPABILITIES = ["field_service"] as const;
export const ACCOUNT_BILLING_RECOVERY_HREF = "/account/billing";

export type ProductAccessResult = {
  entitled: boolean;
  error: string | null;
};

/**
 * Use the existing database entitlement contract as the single source of truth.
 * Package, subscription/grace, and billing-override rules stay in Postgres.
 */
export async function resolveShopProductAccess(args: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  capabilities: readonly ProductCapability[];
}): Promise<ProductAccessResult> {
  const checks = await Promise.all(
    args.capabilities.map((capability) =>
      args.supabase.rpc("profixiq_shop_has_product_access", {
        p_capability: capability,
        p_shop_id: args.shopId,
      }),
    ),
  );

  if (checks.some((check) => check.data === true && !check.error)) {
    return { entitled: true, error: null };
  }

  const error = checks.find((check) => check.error)?.error;
  return {
    entitled: false,
    error: error?.message ?? null,
  };
}
