import type Stripe from "stripe";

import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_KEYS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

type ProductPackagePriceRole =
  | "base"
  | "additional_service_truck"
  | "additional_fleet_asset";

type ExpectedPackagePrice = {
  lookupKey: string;
  amountCents: number;
  role: ProductPackagePriceRole;
  packageKey: ProductPackageKey;
};

const EXPECTED_PACKAGE_PRICES: readonly ExpectedPackagePrice[] = [
  ...PRODUCT_PACKAGE_KEYS.map((packageKey) => ({
    lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
    amountCents: PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
    role: "base" as const,
    packageKey,
  })),
  {
    lookupKey: ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
    amountCents: PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents,
    role: "additional_service_truck",
    packageKey: "field_service",
  },
  {
    lookupKey: ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    amountCents: PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents,
    role: "additional_fleet_asset",
    packageKey: "fleet_maintenance",
  },
] as const;

export type ProductPackagePriceContract = {
  packagePriceIds: Record<ProductPackageKey, string>;
  additionalServiceTruckPriceId: string;
  additionalFleetAssetPriceId: string;
};

function validatePackagePrice(
  price: Stripe.Price,
  expected: ExpectedPackagePrice,
): void {
  if (!price.active)
    throw new Error(`Stripe price ${expected.lookupKey} is inactive`);
  if (price.lookup_key !== expected.lookupKey) {
    throw new Error(`Stripe price lookup mismatch for ${expected.lookupKey}`);
  }
  if (price.currency !== "cad" || price.unit_amount !== expected.amountCents) {
    throw new Error(
      `Stripe price amount mismatch for ${expected.lookupKey}; expected CAD ${expected.amountCents}`,
    );
  }
  if (
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error(
      `Stripe price recurrence mismatch for ${expected.lookupKey}`,
    );
  }
  if (
    price.metadata?.app !== "profixiq" ||
    price.metadata?.billing_model !== PRODUCT_PACKAGE_BILLING_MODEL ||
    price.metadata?.price_role !== expected.role ||
    price.metadata?.package_key !== expected.packageKey
  ) {
    throw new Error(`Stripe price metadata mismatch for ${expected.lookupKey}`);
  }
}

export async function resolveProductPackagePriceContract(
  stripe: Stripe,
): Promise<ProductPackagePriceContract> {
  const response = await stripe.prices.list({
    active: true,
    lookup_keys: EXPECTED_PACKAGE_PRICES.map((price) => price.lookupKey),
    limit: 20,
  });

  const pricesByLookup = new Map<string, Stripe.Price[]>();
  for (const price of response.data) {
    const lookupKey = String(price.lookup_key ?? "").trim();
    if (!lookupKey) continue;
    pricesByLookup.set(lookupKey, [
      ...(pricesByLookup.get(lookupKey) ?? []),
      price,
    ]);
  }

  const resolved = new Map<string, Stripe.Price>();
  for (const expected of EXPECTED_PACKAGE_PRICES) {
    const matches = pricesByLookup.get(expected.lookupKey) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one active Stripe price for ${expected.lookupKey}; found ${matches.length}`,
      );
    }
    validatePackagePrice(matches[0]!, expected);
    resolved.set(expected.lookupKey, matches[0]!);
  }

  return {
    packagePriceIds: Object.fromEntries(
      PRODUCT_PACKAGE_KEYS.map((packageKey) => [
        packageKey,
        resolved.get(PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey])!.id,
      ]),
    ) as Record<ProductPackageKey, string>,
    additionalServiceTruckPriceId: resolved.get(
      ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
    )!.id,
    additionalFleetAssetPriceId: resolved.get(
      ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    )!.id,
  };
}

export async function resolveProductPackagePriceId(
  stripe: Stripe,
  packageKey: ProductPackageKey,
): Promise<string> {
  const contract = await resolveProductPackagePriceContract(stripe);
  return contract.packagePriceIds[packageKey];
}
