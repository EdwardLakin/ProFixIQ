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

/**
 * The Complete + Equipment add-on is a second acquisition path to the same
 * Equipment product, so it is released by the same launch flag.
 */
const EQUIPMENT_LAUNCH_FLAG = "PROFIXIQ_EQUIPMENT_CHECKOUT_ENABLED";

export const EQUIPMENT_COMING_SOON_CODE = "equipment_coming_soon";
export const EQUIPMENT_COMING_SOON_MESSAGE =
  "ProFixIQ Equipment is coming soon and is not available to purchase yet.";

function flagEnabled(
  flag: string,
  env: Record<string, string | undefined>,
): boolean {
  return env[flag]?.trim().toLowerCase() === "true";
}

export function isPackagePubliclyPurchasable(
  packageKey: ProductPackageKey,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = LAUNCH_GATED_PACKAGES[packageKey];
  if (!flag) return true;
  return flagEnabled(flag, env);
}

export function isEquipmentAddonPubliclyPurchasable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return flagEnabled(EQUIPMENT_LAUNCH_FLAG, env);
}

/**
 * True when an untrusted checkout request body asks for any Equipment
 * acquisition (standalone package, Complete + Equipment add-on, or a legacy
 * alias) while Equipment is not open for purchase. Evaluated on the raw body
 * before schema validation so every spelling gets the same Coming soon answer
 * instead of a generic validation error.
 */
export function isBlockedEquipmentCheckoutRequest(
  body: unknown,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  const norm = (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";

  const asksForEquipmentPackage = [record.packageKey, record.planKey].some(
    (value) => {
      const key = norm(value);
      return key === "equipment_operations" || key === "equipment";
    },
  );
  const asksForAddon =
    record.equipmentAddon === true ||
    (record.equipmentAddon !== undefined &&
      record.equipmentAddon !== false &&
      record.equipmentAddon !== null);

  if (asksForEquipmentPackage && !isPackagePubliclyPurchasable("equipment_operations", env)) {
    return true;
  }
  return asksForAddon && !isEquipmentAddonPubliclyPurchasable(env);
}
