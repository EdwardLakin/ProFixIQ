import type Stripe from "stripe";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  ADDITIONAL_USER_LOOKUP_KEY,
  LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_CURRENCY,
  PRODUCT_PACKAGE_INCLUDED_USERS,
  PRODUCT_PACKAGE_KEYS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
  productAcquisitionSurface,
  productPackageAllows,
} from "../features/stripe/lib/stripe/product-packages";
import { resolveProductPackagePriceContract } from "../features/stripe/lib/server/product-package-price-contract";

const MIGRATION =
  "supabase/migrations/20260811200504_product_package_entitlements.sql";
const ENTITLEMENT_SCOPE_MIGRATION =
  "supabase/migrations/20260811202000_scope_product_entitlement_rpcs.sql";
const CHECKOUT = "app/api/stripe/checkout/route.ts";
const RECONCILER =
  "features/stripe/lib/server/product-package-reconciliation.ts";
const WORKER = "app/api/internal/stripe/reconcile-pending-billing/route.ts";

function packagePrice(input: {
  id: string;
  lookupKey: string;
  amountCents: number;
  currency: "usd" | "cad";
  packageKey: (typeof PRODUCT_PACKAGE_KEYS)[number];
  role:
    | "base"
    | "additional_user"
    | "additional_service_truck"
    | "additional_fleet_asset";
}): Stripe.Price {
  return {
    id: input.id,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 1,
    currency: input.currency,
    custom_unit_amount: null,
    livemode: true,
    lookup_key: input.lookupKey,
    metadata: {
      app: "profixiq",
      billing_model: PRODUCT_PACKAGE_BILLING_MODEL,
      package_key: input.packageKey,
      price_role: input.role,
    },
    nickname: null,
    product: "prod_test",
    recurring: {
      aggregate_usage: null,
      interval: "month",
      interval_count: 1,
      meter: null,
      trial_period_days: null,
      usage_type: "licensed",
    },
    tax_behavior: "exclusive",
    tiers_mode: null,
    transform_quantity: null,
    type: "recurring",
    unit_amount: input.amountCents,
    unit_amount_decimal: String(input.amountCents),
  } as Stripe.Price;
}

function currentCatalogPrices(): Stripe.Price[] {
  return [
    ...PRODUCT_PACKAGE_KEYS.map((packageKey) =>
      packagePrice({
        id: `price_usd_${packageKey}`,
        lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
        amountCents: PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
        currency: "usd",
        packageKey,
        role: "base",
      }),
    ),
    packagePrice({
      id: "price_user",
      lookupKey: ADDITIONAL_USER_LOOKUP_KEY,
      amountCents: PRODUCT_PACKAGE_PRICING.additionalUserCents,
      currency: "usd",
      packageKey: "shop_operations",
      role: "additional_user",
    }),
    packagePrice({
      id: "price_usd_truck",
      lookupKey: ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      amountCents: PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents,
      currency: "usd",
      packageKey: "field_service",
      role: "additional_service_truck",
    }),
    packagePrice({
      id: "price_usd_asset",
      lookupKey: ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
      amountCents: PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents,
      currency: "usd",
      packageKey: "fleet_maintenance",
      role: "additional_fleet_asset",
    }),
  ];
}

function legacyCatalogPrices(): Stripe.Price[] {
  return [
    ...PRODUCT_PACKAGE_KEYS.map((packageKey) =>
      packagePrice({
        id: `price_cad_${packageKey}`,
        lookupKey: LEGACY_PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
        amountCents:
          packageKey === "complete_operations"
            ? 44_900
            : PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
        currency: "cad",
        packageKey,
        role: "base",
      }),
    ),
    packagePrice({
      id: "price_cad_truck",
      lookupKey: LEGACY_ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
      amountCents: 4_900,
      currency: "cad",
      packageKey: "field_service",
      role: "additional_service_truck",
    }),
    packagePrice({
      id: "price_cad_asset",
      lookupKey: LEGACY_ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
      amountCents: 250,
      currency: "cad",
      packageKey: "fleet_maintenance",
      role: "additional_fleet_asset",
    }),
  ];
}

describe("ProFixIQ product package billing contract", () => {
  it("pins the USD package, included-user, and capacity prices", () => {
    expect(PRODUCT_PACKAGE_CURRENCY).toBe("usd");
    expect(PRODUCT_PACKAGE_INCLUDED_USERS).toBe(10);
    expect(PRODUCT_PACKAGE_PRICING.shop_operations.monthlyCents).toBe(29_900);
    expect(PRODUCT_PACKAGE_PRICING.field_service.monthlyCents).toBe(19_900);
    expect(PRODUCT_PACKAGE_PRICING.fleet_maintenance.monthlyCents).toBe(14_900);
    expect(PRODUCT_PACKAGE_PRICING.complete_operations.monthlyCents).toBe(
      49_900,
    );
    expect(PRODUCT_PACKAGE_PRICING.additionalUserCents).toBe(5_000);
    expect(PRODUCT_PACKAGE_PRICING.shop_operations.includedUsers).toBe(10);
    expect(PRODUCT_PACKAGE_PRICING.complete_operations.includedUsers).toBe(10);
    expect(PRODUCT_PACKAGE_PRICING.field_service.includedUsers).toBeNull();
    expect(PRODUCT_PACKAGE_PRICING.fleet_maintenance.includedUsers).toBeNull();
    expect(PRODUCT_PACKAGE_PRICING.field_service.includedServiceTrucks).toBe(1);
    expect(
      PRODUCT_PACKAGE_PRICING.complete_operations.includedServiceTrucks,
    ).toBe(2);
    expect(PRODUCT_PACKAGE_PRICING.fleet_maintenance.includedFleetAssets).toBe(
      10,
    );
    expect(PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents).toBe(4_900);
    expect(PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents).toBe(250);
  });

  it("keeps product capabilities separate and makes Complete the explicit union", () => {
    expect(productPackageAllows("shop_operations", "shop")).toBe(true);
    expect(productPackageAllows("shop_operations", "field_service")).toBe(
      false,
    );
    expect(productPackageAllows("field_service", "fleet_maintenance")).toBe(
      false,
    );
    expect(productPackageAllows("fleet_maintenance", "shop")).toBe(false);
    expect(productPackageAllows("complete_operations", "shop")).toBe(true);
    expect(productPackageAllows("complete_operations", "field_service")).toBe(
      true,
    );
    expect(
      productPackageAllows("complete_operations", "fleet_maintenance"),
    ).toBe(true);
  });

  it("maps every package to its canonical account acquisition surface", () => {
    expect(productAcquisitionSurface("shop_operations")).toBe("shop");
    expect(productAcquisitionSurface("field_service")).toBe("field");
    expect(productAcquisitionSurface("fleet_maintenance")).toBe("fleet");
    expect(productAcquisitionSurface("complete_operations")).toBe("shop");
  });

  it("resolves the USD acquisition catalog and legacy CAD catalog separately", async () => {
    const prices = [...currentCatalogPrices(), ...legacyCatalogPrices()];
    const list = vi.fn().mockResolvedValue({ data: prices });

    await expect(
      resolveProductPackagePriceContract({ prices: { list } } as never),
    ).resolves.toMatchObject({
      packagePriceIds: {
        shop_operations: "price_usd_shop_operations",
        field_service: "price_usd_field_service",
        fleet_maintenance: "price_usd_fleet_maintenance",
        complete_operations: "price_usd_complete_operations",
      },
      additionalUserPriceId: "price_user",
      additionalServiceTruckPriceId: "price_usd_truck",
      additionalFleetAssetPriceId: "price_usd_asset",
      legacyCad: {
        packagePriceIds: {
          shop_operations: "price_cad_shop_operations",
          field_service: "price_cad_field_service",
          fleet_maintenance: "price_cad_fleet_maintenance",
          complete_operations: "price_cad_complete_operations",
        },
        additionalServiceTruckPriceId: "price_cad_truck",
        additionalFleetAssetPriceId: "price_cad_asset",
      },
    });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 30 }),
    );
  });

  it("fails closed when the USD package catalog drifts", async () => {
    const prices = [...currentCatalogPrices(), ...legacyCatalogPrices()];
    const shopIndex = prices.findIndex(
      (price) => price.lookup_key === PRODUCT_PACKAGE_LOOKUP_KEYS.shop_operations,
    );
    prices[shopIndex] = packagePrice({
      id: "price_bad",
      lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS.shop_operations,
      amountCents: 30_000,
      currency: "usd",
      packageKey: "shop_operations",
      role: "base",
    });
    const list = vi.fn().mockResolvedValue({ data: prices });
    await expect(
      resolveProductPackagePriceContract({ prices: { list } } as never),
    ).rejects.toThrow("Stripe price amount mismatch");
  });

  it("binds Checkout and database gates to package identity and seat reconciliation", async () => {
    const [checkout, migration, scopeMigration, reconciler, worker] =
      await Promise.all([
        readFile(CHECKOUT, "utf8"),
        readFile(MIGRATION, "utf8"),
        readFile(ENTITLEMENT_SCOPE_MIGRATION, "utf8"),
        readFile(RECONCILER, "utf8"),
        readFile(WORKER, "utf8"),
      ]);
    expect(checkout).toContain("packageKey: z.enum(PRODUCT_PACKAGE_KEYS)");
    expect(checkout).toContain("package_key: selection.packageKey");
    expect(checkout).toContain(
      "acquisition_surface: input.selection.acquisitionSurface",
    );
    expect(checkout).toContain("surface=${selection.acquisitionSurface}");
    expect(checkout).not.toContain("payment_method_types");
    expect(checkout).toContain('payment_method_collection: "always"');
    expect(checkout).not.toContain('"if_required"');
    expect(checkout).toContain("missing_payment_method");
    expect(checkout).toContain('"cancel"');
    expect(migration).toContain("profixiq_shop_has_product_access");
    expect(migration).toContain("profixiq_fleet_has_product_access");
    expect(migration).toContain("mobile_profile_has_field_service_access");
    expect(migration).toContain(
      "subscription_package = v_subscription_package",
    );
    expect(migration).toContain("fleet_vehicle.active");
    expect(migration).toContain("service_vehicles_mark_package_billing_sync");
    expect(migration).toContain("fleet_vehicles_mark_package_billing_sync");
    expect(migration).toContain(
      "where shop.id in (v_old_shop_id, v_new_shop_id)",
    );
    expect(scopeMigration).toContain("auth.role() = 'service_role'");
    expect(scopeMigration).toContain("profile.user_id = auth.uid()");
    expect(scopeMigration).toContain("member.user_id = auth.uid()");
    expect(scopeMigration).toContain("member.fleet_id = fleet.id");
    expect(reconciler).toContain("additionalUserPriceId");
    expect(reconciler).toContain("additionalServiceTruckPriceId");
    expect(reconciler).toContain("additionalFleetAssetPriceId");
    expect(reconciler).toContain("PRODUCT_PACKAGE_INCLUDED_USERS");
    expect(reconciler).toContain('legacyCad ? 0 : currentCatalogAdditionalUsers');
    expect(reconciler).toContain('packageKey === "fleet_maintenance"');
    expect(reconciler).not.toContain(
      'packageKey === "complete_operations"\n        ? Math.max(0, capacity.activeFleetAssets',
    );
    expect(worker).toContain("reconcileProductPackageSubscription");
    expect(worker).toContain("reconcileShopSubscriptionSeats");
  });
});
