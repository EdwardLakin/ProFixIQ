export const PRODUCT_PACKAGE_BILLING_MODEL = "product_packages_v1" as const;

export const PRODUCT_PACKAGE_KEYS = [
  "shop_operations",
  "field_service",
  "fleet_maintenance",
  "complete_operations",
] as const;

export type ProductPackageKey = (typeof PRODUCT_PACKAGE_KEYS)[number];
export type ProductCapability = "shop" | "field_service" | "fleet_maintenance";

export const PRODUCT_PACKAGE_LOOKUP_KEYS: Record<ProductPackageKey, string> = {
  shop_operations: "profixiq_shop_operations_monthly_v1",
  field_service: "profixiq_field_service_monthly_v1",
  fleet_maintenance: "profixiq_fleet_maintenance_monthly_v1",
  complete_operations: "profixiq_complete_operations_monthly_v1",
};

export const ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY =
  "profixiq_additional_service_truck_monthly_v1";
export const ADDITIONAL_FLEET_ASSET_LOOKUP_KEY =
  "profixiq_additional_fleet_asset_monthly_v1";

export const PRODUCT_PACKAGE_PRICING = {
  shop_operations: {
    monthlyCents: 29_900,
    includedServiceTrucks: 0,
    includedFleetAssets: 0,
  },
  field_service: {
    monthlyCents: 19_900,
    includedServiceTrucks: 1,
    includedFleetAssets: 0,
  },
  fleet_maintenance: {
    monthlyCents: 14_900,
    includedServiceTrucks: 0,
    includedFleetAssets: 10,
  },
  complete_operations: {
    monthlyCents: 44_900,
    includedServiceTrucks: 2,
    includedFleetAssets: 10,
  },
  additionalServiceTruckCents: 4_900,
  additionalFleetAssetCents: 250,
} as const;

export const PRODUCT_PACKAGE_CATALOG: Record<
  ProductPackageKey,
  {
    name: string;
    shortName: string;
    description: string;
    capabilities: readonly ProductCapability[];
  }
> = {
  shop_operations: {
    name: "Shop Operations",
    shortName: "Shop",
    description: "The complete repair-shop operating system for one location.",
    capabilities: ["shop"],
  },
  field_service: {
    name: "Field Service",
    shortName: "Field",
    description:
      "Dispatch, service-truck execution, and off-site repair workflows.",
    capabilities: ["field_service"],
  },
  fleet_maintenance: {
    name: "Fleet Maintenance",
    shortName: "Fleet",
    description:
      "Fleet-owned assets, maintenance programs, compliance, and repair history.",
    capabilities: ["fleet_maintenance"],
  },
  complete_operations: {
    name: "Complete Operations",
    shortName: "Complete",
    description:
      "Shop, Field Service, and Fleet Maintenance in one operating system.",
    capabilities: ["shop", "field_service", "fleet_maintenance"],
  },
};

const PACKAGE_KEY_SET = new Set<string>(PRODUCT_PACKAGE_KEYS);
const ENTITLED_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
]);

export function isProductPackageKey(
  value: unknown,
): value is ProductPackageKey {
  return PACKAGE_KEY_SET.has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

export function normalizeProductPackageKey(
  value: unknown,
): ProductPackageKey | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return isProductPackageKey(normalized) ? normalized : null;
}

export function productPackageAllows(
  packageKey: ProductPackageKey,
  capability: ProductCapability,
): boolean {
  return PRODUCT_PACKAGE_CATALOG[packageKey].capabilities.includes(capability);
}

export function isProductSubscriptionEntitled(status: unknown): boolean {
  return ENTITLED_SUBSCRIPTION_STATUSES.has(
    String(status ?? "")
      .trim()
      .toLowerCase(),
  );
}
