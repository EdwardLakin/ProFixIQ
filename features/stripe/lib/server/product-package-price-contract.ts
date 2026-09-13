import type Stripe from "stripe";

import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  ADDITIONAL_USER_LOOKUP_KEY,
  LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_CURRENCY,
  PRODUCT_PACKAGE_KEYS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
  type ProductPackageKey,
} from "@/features/stripe/lib/stripe/product-packages";

type ProductPackagePriceRole =
  | "base"
  | "additional_user"
  | "additional_service_truck"
  | "additional_fleet_asset";

type ExpectedPackagePrice = {
  lookupKey: string;
  amountCents: number;
  currency: "usd" | "cad";
  role: ProductPackagePriceRole;
  packageKey: ProductPackageKey;
};

const CURRENT_PACKAGE_PRICES: readonly ExpectedPackagePrice[] = [
  ...PRODUCT_PACKAGE_KEYS.map((packageKey) => ({
    lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
    amountCents: PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
    currency: PRODUCT_PACKAGE_CURRENCY,
    role: "base" as const,
    packageKey,
  })),
  {
    lookupKey: ADDITIONAL_USER_LOOKUP_KEY,
    amountCents: PRODUCT_PACKAGE_PRICING.additionalUserCents,
    currency: PRODUCT_PACKAGE_CURRENCY,
    role: "additional_user" as const,
    // The same staff-seat price is used by Shop and Complete. Metadata binds
    // it to Shop for catalog validation; reconciliation only permits the line
    // on those two packages.
    packageKey: "shop_operations" as const,
  },
  {
    lookupKey: ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
    amountCents: PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents,
    currency: PRODUCT_PACKAGE_CURRENCY,
    role: "additional_service_truck" as const,
    packageKey: "field_service" as const,
  },
  {
    lookupKey: ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    amountCents: PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents,
    currency: PRODUCT_PACKAGE_CURRENCY,
    role: "additional_fleet_asset" as const,
    packageKey: "fleet_maintenance" as const,
  },
] as const;

const LEGACY_CAD_PACKAGE_PRICES: readonly ExpectedPackagePrice[] = [
  ...PRODUCT_PACKAGE_KEYS.map((packageKey) => ({
    lookupKey: LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
    amountCents:
      packageKey === "complete_operations"
        ? 44_900
        : PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
    currency: "cad" as const,
    role: "base" as const,
    packageKey,
  })),
  {
    lookupKey: LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
    amountCents: 4_900,
    currency: "cad" as const,
    role: "additional_service_truck" as const,
    packageKey: "field_service" as const,
  },
  {
    lookupKey: LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    amountCents: 250,
    currency: "cad" as const,
    role: "additional_fleet_asset" as const,
    packageKey: "fleet_maintenance" as const,
  },
] as const;

export type ProductPackageCatalogPriceIds = {
  packagePriceIds: Record<ProductPackageKey, string>;
  additionalServiceTruckPriceId: string;
  additionalFleetAssetPriceId: string;
};

export type ProductPackagePriceContract = ProductPackageCatalogPriceIds & {
  additionalUserPriceId: string;
  legacyCad: ProductPackageCatalogPriceIds;
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
  if (
    price.currency !== expected.currency ||
    price.unit_amount !== expected.amountCents
  ) {
    throw new Error(
      `Stripe price amount mismatch for ${expected.lookupKey}; expected ${expected.currency.toUpperCase()} ${expected.amountCents}`,
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

function collectByLookup(prices: Stripe.Price[]): Map<string, Stripe.Price[]> {
  const pricesByLookup = new Map<string, Stripe.Price[]>();
  for (const price of prices) {
    const lookupKey = String(price.lookup_key ?? "").trim();
    if (!lookupKey) continue;
    pricesByLookup.set(lookupKey, [
      ...(pricesByLookup.get(lookupKey) ?? []),
      price,
    ]);
  }
  return pricesByLookup;
}

function resolveExpectedPrices(
  pricesByLookup: Map<string, Stripe.Price[]>,
  expectedPrices: readonly ExpectedPackagePrice[],
): Map<string, Stripe.Price> {
  const resolved = new Map<string, Stripe.Price>();
  for (const expected of expectedPrices) {
    const matches = pricesByLookup.get(expected.lookupKey) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one active Stripe price for ${expected.lookupKey}; found ${matches.length}`,
      );
    }
    validatePackagePrice(matches[0]!, expected);
    resolved.set(expected.lookupKey, matches[0]!);
  }
  return resolved;
}

function catalogIds(
  resolved: Map<string, Stripe.Price>,
  lookupKeys: Record<ProductPackageKey, string>,
  truckLookupKey: string,
  assetLookupKey: string,
): ProductPackageCatalogPriceIds {
  return {
    packagePriceIds: Object.fromEntries(
      PRODUCT_PACKAGE_KEYS.map((packageKey) => [
        packageKey,
        resolved.get(lookupKeys[packageKey])!.id,
      ]),
    ) as Record<ProductPackageKey, string>,
    additionalServiceTruckPriceId: resolved.get(truckLookupKey)!.id,
    additionalFleetAssetPriceId: resolved.get(assetLookupKey)!.id,
  };
}

export async function resolveProductPackagePriceContract(
  stripe: Stripe,
): Promise<ProductPackagePriceContract> {
  const expectedPrices = [
    ...CURRENT_PACKAGE_PRICES,
    ...LEGACY_CAD_PACKAGE_PRICES,
  ];
  const response = await stripe.prices.list({
    active: true,
    lookup_keys: expectedPrices.map((price) => price.lookupKey),
    limit: 30,
  });

  const pricesByLookup = collectByLookup(response.data);
  const current = resolveExpectedPrices(pricesByLookup, CURRENT_PACKAGE_PRICES);
  const legacy = resolveExpectedPrices(
    pricesByLookup,
    LEGACY_CAD_PACKAGE_PRICES,
  );

  return {
    ...catalogIds(
      current,
      PRODUCT_PACKAGE_LOOKUP_KEYS,
      ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    ),
    additionalUserPriceId: current.get(ADDITIONAL_USER_LOOKUP_KEY)!.id,
    legacyCad: catalogIds(
      legacy,
      LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
      LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
    ),
  };
}

export async function resolveProductPackagePriceId(
  stripe: Stripe,
  packageKey: ProductPackageKey,
): Promise<string> {
  const contract = await resolveProductPackagePriceContract(stripe);
  return contract.packagePriceIds[packageKey];
}
