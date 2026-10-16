// Standalone Equipment Operations product definition.
//
// Isolated addition: Equipment Operations is deliberately NOT a member of
// PRODUCT_PACKAGE_KEYS yet. Joining that catalog changes shared contracts
// (shops_subscription_package_check, canonical billing RPC validation,
// profixiq_shop_has_product_access, the shared Stripe price contract), which
// requires explicit contract-change approval. Until then this module owns the
// product's identity and pricing so the foundation PR can adopt it in one
// coordinated step. The legacy Complete Operations + Equipment add-on path in
// product-packages.ts / equipmentAddonEntitlement.ts is untouched.
import {
  ADDITIONAL_USER_LOOKUP_KEY,
  PRODUCT_PACKAGE_ADDITIONAL_USER_CENTS,
  PRODUCT_PACKAGE_INCLUDED_USERS,
} from "@/features/stripe/lib/stripe/product-packages";

export const EQUIPMENT_OPERATIONS_PACKAGE_KEY = "equipment_operations" as const;
export type EquipmentOperationsPackageKey =
  typeof EQUIPMENT_OPERATIONS_PACKAGE_KEY;

export const EQUIPMENT_OPERATIONS_LOOKUP_KEY =
  "profixiq_equipment_operations_monthly_usd_v1";
export const EQUIPMENT_OPERATIONS_MONTHLY_CENTS = 39_900;

// Same staff-seat model as Shop: one price per additional user, no role-based
// seat pricing. The existing additional-user Stripe price is reused.
export const EQUIPMENT_OPERATIONS_ADDITIONAL_USER_LOOKUP_KEY =
  ADDITIONAL_USER_LOOKUP_KEY;

export const EQUIPMENT_OPERATIONS_PRICING = {
  monthlyCents: EQUIPMENT_OPERATIONS_MONTHLY_CENTS,
  includedUsers: PRODUCT_PACKAGE_INCLUDED_USERS,
  additionalUserCents: PRODUCT_PACKAGE_ADDITIONAL_USER_CENTS,
} as const;

export const EQUIPMENT_OPERATIONS_CATALOG = {
  name: "Equipment Operations",
  shortName: "Equipment",
  description:
    "Repair-shop operations for heavy equipment and machinery: work orders, inspections, parts, approvals, PM, and service history.",
} as const;

// Acquisition surface and post-checkout destinations for the standalone
// product. These are not wired into acquisitionSurfaceRouting.ts yet; that
// shared map adopts them in the approved foundation PR.
export const EQUIPMENT_ACQUISITION_SURFACE = "equipment" as const;
export const EQUIPMENT_ACQUISITION_HOME = "/equipment/dashboard";
export const EQUIPMENT_ACQUISITION_ONBOARDING = `/onboarding?surface=${EQUIPMENT_ACQUISITION_SURFACE}`;

export function estimateEquipmentOperationsMonthlyCents(
  activeUsers: number,
): number {
  const additionalUsers = Math.max(
    0,
    Math.floor(activeUsers) - EQUIPMENT_OPERATIONS_PRICING.includedUsers,
  );
  return (
    EQUIPMENT_OPERATIONS_PRICING.monthlyCents +
    additionalUsers * EQUIPMENT_OPERATIONS_PRICING.additionalUserCents
  );
}
