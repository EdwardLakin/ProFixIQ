import type Stripe from "stripe";

import {
  EQUIPMENT_OPERATIONS_LOOKUP_KEY,
  EQUIPMENT_OPERATIONS_MONTHLY_CENTS,
  EQUIPMENT_OPERATIONS_PACKAGE_KEY,
} from "@/features/equipment/lib/equipmentProduct";
import {
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_CURRENCY,
} from "@/features/stripe/lib/stripe/product-packages";

// Resolved separately from resolveProductPackagePriceContract on purpose: that
// contract requires every listed price to exist, so adding Equipment to it
// would break every Shop/Field/Fleet/Complete checkout until the Equipment
// price is provisioned in Stripe.
export async function resolveEquipmentOperationsPriceId(
  stripe: Stripe,
): Promise<string> {
  const response = await stripe.prices.list({
    active: true,
    lookup_keys: [EQUIPMENT_OPERATIONS_LOOKUP_KEY],
    limit: 10,
  });
  const matches = response.data.filter(
    (price) => price.lookup_key === EQUIPMENT_OPERATIONS_LOOKUP_KEY,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active Stripe price for ${EQUIPMENT_OPERATIONS_LOOKUP_KEY}; found ${matches.length}`,
    );
  }

  const price = matches[0]!;
  if (
    !price.active ||
    price.currency !== PRODUCT_PACKAGE_CURRENCY ||
    price.unit_amount !== EQUIPMENT_OPERATIONS_MONTHLY_CENTS ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(
      `Stripe Equipment Operations price contract mismatch for ${EQUIPMENT_OPERATIONS_LOOKUP_KEY}`,
    );
  }
  if (
    price.metadata?.app !== "profixiq" ||
    price.metadata?.billing_model !== PRODUCT_PACKAGE_BILLING_MODEL ||
    price.metadata?.price_role !== "base" ||
    price.metadata?.package_key !== EQUIPMENT_OPERATIONS_PACKAGE_KEY
  ) {
    throw new Error(
      `Stripe Equipment Operations price metadata mismatch for ${EQUIPMENT_OPERATIONS_LOOKUP_KEY}`,
    );
  }

  return price.id;
}
