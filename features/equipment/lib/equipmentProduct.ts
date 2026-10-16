// Standalone Equipment Operations product surface. Package identity, pricing
// and capabilities live in the shared catalog
// (features/stripe/lib/stripe/product-packages.ts); this module only holds the
// Equipment-specific destinations and display helpers.
import {
  PRODUCT_PACKAGE_PRICING,
  productAcquisitionSurface,
} from "@/features/stripe/lib/stripe/product-packages";

export const EQUIPMENT_HOME_HREF = "/equipment/dashboard";

export const EQUIPMENT_ACQUISITION_SURFACE = productAcquisitionSurface(
  "equipment_operations",
);

export function estimateEquipmentOperationsMonthlyCents(
  activeUsers: number,
): number {
  const pricing = PRODUCT_PACKAGE_PRICING.equipment_operations;
  const additionalUsers = Math.max(
    0,
    Math.floor(activeUsers) - pricing.includedUsers,
  );
  return (
    pricing.monthlyCents +
    additionalUsers * PRODUCT_PACKAGE_PRICING.additionalUserCents
  );
}
