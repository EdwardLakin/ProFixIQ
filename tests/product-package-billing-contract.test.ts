import type Stripe from "stripe";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
  ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
  PRODUCT_PACKAGE_BILLING_MODEL,
  PRODUCT_PACKAGE_KEYS,
  PRODUCT_PACKAGE_LOOKUP_KEYS,
  PRODUCT_PACKAGE_PRICING,
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
  packageKey: (typeof PRODUCT_PACKAGE_KEYS)[number];
  role: "base" | "additional_service_truck" | "additional_fleet_asset";
}): Stripe.Price {
  return {
    id: input.id,
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    created: 1,
    currency: "cad",
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

describe("ProFixIQ product package billing contract", () => {
  it("pins the agreed CAD package and capacity prices", () => {
    expect(PRODUCT_PACKAGE_PRICING.shop_operations.monthlyCents).toBe(29_900);
    expect(PRODUCT_PACKAGE_PRICING.field_service.monthlyCents).toBe(19_900);
    expect(PRODUCT_PACKAGE_PRICING.fleet_maintenance.monthlyCents).toBe(14_900);
    expect(PRODUCT_PACKAGE_PRICING.complete_operations.monthlyCents).toBe(
      44_900,
    );
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

  it("resolves every live package and capacity price by lookup key", async () => {
    const prices = [
      ...PRODUCT_PACKAGE_KEYS.map((packageKey) =>
        packagePrice({
          id: `price_${packageKey}`,
          lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS[packageKey],
          amountCents: PRODUCT_PACKAGE_PRICING[packageKey].monthlyCents,
          packageKey,
          role: "base",
        }),
      ),
      packagePrice({
        id: "price_truck",
        lookupKey: ADDITIONAL_SERVICE_TRUCK_LOOKUP_KEY,
        amountCents: PRODUCT_PACKAGE_PRICING.additionalServiceTruckCents,
        packageKey: "field_service",
        role: "additional_service_truck",
      }),
      packagePrice({
        id: "price_asset",
        lookupKey: ADDITIONAL_FLEET_ASSET_LOOKUP_KEY,
        amountCents: PRODUCT_PACKAGE_PRICING.additionalFleetAssetCents,
        packageKey: "fleet_maintenance",
        role: "additional_fleet_asset",
      }),
    ];
    const list = vi.fn().mockResolvedValue({ data: prices });

    await expect(
      resolveProductPackagePriceContract({ prices: { list } } as never),
    ).resolves.toMatchObject({
      packagePriceIds: {
        shop_operations: "price_shop_operations",
        field_service: "price_field_service",
        fleet_maintenance: "price_fleet_maintenance",
        complete_operations: "price_complete_operations",
      },
      additionalServiceTruckPriceId: "price_truck",
      additionalFleetAssetPriceId: "price_asset",
    });
  });

  it("fails closed when the package catalog drifts", async () => {
    const drifted = packagePrice({
      id: "price_bad",
      lookupKey: PRODUCT_PACKAGE_LOOKUP_KEYS.shop_operations,
      amountCents: 30_000,
      packageKey: "shop_operations",
      role: "base",
    });
    const list = vi.fn().mockResolvedValue({ data: [drifted] });
    await expect(
      resolveProductPackagePriceContract({ prices: { list } } as never),
    ).rejects.toThrow("Stripe price amount mismatch");
  });

  it("binds Checkout and database gates to package identity", async () => {
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
    expect(checkout).not.toContain("payment_method_types");
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
    expect(reconciler).toContain("additionalServiceTruckPriceId");
    expect(reconciler).toContain("additionalFleetAssetPriceId");
    expect(reconciler).toContain('packageKey === "fleet_maintenance"');
    expect(reconciler).not.toContain(
      'packageKey === "complete_operations"\n        ? Math.max(0, capacity.activeFleetAssets',
    );
    expect(worker).toContain("reconcileProductPackageSubscription");
    expect(worker).toContain("reconcileShopSubscriptionSeats");
  });
});
