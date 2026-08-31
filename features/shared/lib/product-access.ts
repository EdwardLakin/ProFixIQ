import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type {
  ProductAcquisitionSurface,
  ProductCapability,
} from "@/features/stripe/lib/stripe/product-packages";

export const SHOP_PRODUCT_CAPABILITIES = ["shop"] as const;
export const FIELD_PRODUCT_CAPABILITIES = ["field_service"] as const;
export const FLEET_PRODUCT_CAPABILITIES = ["fleet_maintenance"] as const;
export const SHOP_OR_FIELD_PRODUCT_CAPABILITIES = [
  "shop",
  "field_service",
] as const;
export const ACCOUNT_BILLING_RECOVERY_HREF = "/account/billing";

export function acquisitionSurfaceProductCapabilities(
  surface: ProductAcquisitionSurface,
): readonly ProductCapability[] {
  if (surface === "field") return FIELD_PRODUCT_CAPABILITIES;
  if (surface === "fleet") return FLEET_PRODUCT_CAPABILITIES;
  return SHOP_PRODUCT_CAPABILITIES;
}

export type ProductAccessResult = {
  entitled: boolean;
  error: string | null;
};

/**
 * Resolve the canonical product entitlement inside the authenticated tenant.
 *
 * The database function owns package, subscription/grace, and billing-override
 * semantics. Callers intentionally do not reproduce those rules in TypeScript.
 * An empty capability list is reserved for authenticated account-recovery
 * surfaces that do not expose operational product data.
 */
export async function resolveShopProductAccess(args: {
  supabase: SupabaseClient<Database>;
  shopId: string;
  capabilities: readonly ProductCapability[];
}): Promise<ProductAccessResult> {
  if (args.capabilities.length === 0) {
    return { entitled: true, error: null };
  }

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

export function productAccessSignInHref(
  capabilities: readonly ProductCapability[],
): string {
  if (capabilities.includes("field_service")) {
    return "/field/sign-in?access=field_required";
  }
  if (capabilities.includes("fleet_maintenance")) {
    return "/fleet/sign-in?access=fleet_required";
  }
  return "/shop/sign-in?access=shop_required";
}
