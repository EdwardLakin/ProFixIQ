import "server-only";

import type { ProductPackageKey } from "@/features/stripe/lib/stripe/product-packages";

/**
 * Packages that exist in the billing catalog but are not open for public
 * purchase until their launch. Catalog membership makes a package billable and
 * reconcilable; it must not by itself make it purchasable, because checkout
 * creates a live Stripe session for whatever package the request names.
 */
const LAUNCH_GATED_PACKAGES: Partial<Record<ProductPackageKey, string>> = {
  equipment_operations: "PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED",
};

export function isPackagePubliclyPurchasable(
  packageKey: ProductPackageKey,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = LAUNCH_GATED_PACKAGES[packageKey];
  if (!flag) return true;
  return env[flag]?.trim().toLowerCase() === "true";
}
