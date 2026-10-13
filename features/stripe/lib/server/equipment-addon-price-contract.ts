import type Stripe from "stripe";

import {
  EQUIPMENT_ADDON_LOOKUP_KEY,
  EQUIPMENT_ADDON_MONTHLY_CENTS,
  PRODUCT_PACKAGE_CURRENCY,
} from "@/features/stripe/lib/stripe/product-packages";

export async function resolveEquipmentAddonPriceId(
  stripe: Stripe,
): Promise<string> {
  const response = await stripe.prices.list({
    active: true,
    lookup_keys: [EQUIPMENT_ADDON_LOOKUP_KEY],
    limit: 10,
  });
  const matches = response.data.filter(
    (price) => price.lookup_key === EQUIPMENT_ADDON_LOOKUP_KEY,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active Stripe price for ${EQUIPMENT_ADDON_LOOKUP_KEY}; found ${matches.length}`,
    );
  }

  const price = matches[0]!;
  if (
    !price.active ||
    price.currency !== PRODUCT_PACKAGE_CURRENCY ||
    price.unit_amount !== EQUIPMENT_ADDON_MONTHLY_CENTS ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(
      `Stripe Equipment add-on price contract mismatch for ${EQUIPMENT_ADDON_LOOKUP_KEY}`,
    );
  }

  return price.id;
}
